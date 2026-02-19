/**
 * SQL macro that normalizes a text string by applying NFC normalization,
 * stripping accents, converting to lowercase, and trimming whitespace.
 * Renamed to `normalize_text_join` to avoid collision with other normalize_text macros.
 *
 * @example SELECT normalize_text_join('Héllo Wørld!');
 */
const normalize_text_join_macro = `CREATE OR REPLACE MACRO normalize_text_join(string) AS (
    nfc_normalize(CAST(string AS VARCHAR)).strip_accents().lower().trim()
);`;

/**
 * SQL macro that calculates the Jaro-Winkler similarity score between a candidate string
 * and a table of strings, categorizes the similarity into 'exact', 'partial', or 'toofar',
 * and returns matches excluding 'toofar'.
 * Uses score_cutoff=0.85 for early pruning of low-similarity pairs.
 *
 * @param candidate - The candidate string to find similar matches for.
 * @param join_table - The name of the table to search for similar strings.
 * @returns A table with similarity matches, excluding those categorized as 'toofar'.
 */
const get_similarity_macro = `CREATE OR REPLACE MACRO get_similarity(candidate, join_table) AS TABLE (
  WITH t0 AS (
    SELECT normalize_text_join(CAST(candidate AS VARCHAR)) as search_term
  ), t1 AS (
    -- Jaro-Winkler score on all entities across all basemaps
    -- Categorized into 3 types: exact, partial, toofar
    FROM t0, query_table(join_table)
    SELECT
      jaro_winkler_similarity(search_term, "normalized", 0.85) as score,
      CASE
        WHEN score = 1 THEN 'exact'
        WHEN score >= 0.85 THEN 'partial'
        ELSE 'toofar'
      END as typo_match,
      * EXCLUDE (search_term, normalized)
  )
    -- Filter out 'toofar' results
    FROM t1
    SELECT *
    WHERE typo_match <> 'toofar'
    ORDER BY score DESC
);`;

const analyze_join_quality_macro = `CREATE OR REPLACE MACRO analyze_join_quality(candidates_table, geoname_column, join_table) AS TABLE (
    WITH source_with_counts AS (
        SELECT
            CAST("geoname_column" AS VARCHAR) as original_name,
            COUNT(*) OVER (PARTITION BY normalize_text_join(CAST("geoname_column" AS VARCHAR))) as source_dup_count
        FROM query_table(candidates_table)
        WHERE "geoname_column" IS NOT NULL
    ),
    candidates AS (
        SELECT DISTINCT original_name, source_dup_count FROM source_with_counts
    ),
    matches AS (
        FROM candidates, LATERAL (SELECT * FROM get_similarity(original_name, join_table))
    ),
    best_matches AS (
        SELECT
            original_name,
            list(DISTINCT {id: id, name: raw, score: score, type: typo_match}) as candidates,
            max(score) as best_score,
            count(*) as match_count,
            count(DISTINCT id) as distinct_id_count,
            count(DISTINCT CASE WHEN typo_match = 'exact' THEN id END) as distinct_exact_id_count
        FROM matches
        GROUP BY original_name
    )
    SELECT
        c.original_name,
        c.source_dup_count,
        CASE
            WHEN c.source_dup_count > 1 THEN 'duplicate'
            WHEN bm.best_score IS NULL THEN 'not_found'
            WHEN bm.best_score = 1 AND bm.distinct_exact_id_count = 1 THEN 'matched'
            WHEN bm.best_score = 1 AND bm.distinct_exact_id_count > 1 THEN 'ambiguous'
            ELSE 'check'
        END as status,
        bm.candidates,
        bm.best_score
    FROM candidates c
    LEFT JOIN best_matches bm ON c.original_name = bm.original_name
);`;

/**
 * SQL macro for creating a join table from a basemap.
 * Two versions: one with a single ID column (2 args) and one with additional ID columns (3 args).
 *
 * @param basemap_table - The name of the basemap table. Must be provided as a string literal (e.g., 'table_name').
 * @param main_id - The name of the main ID column in the basemap table.
 * @param others_id - (3-arg version only) Other ID column names in the basemap table.
 * @returns A table with columns: raw, id, variant, normalized, basemap, basemap_count.
 *
 * @example get_join_table_from_basemap('basemap_table_name', main_id_column)
 * @example get_join_table_from_basemap('basemap_table_name', main_id_column, list_value(['other_id1', 'other_id2']))
 */
const get_join_table_from_basemap_macro = `CREATE OR REPLACE MACRO get_join_table_from_basemap
-- NOTE: basemap_table must be provided as a string literal. e.g., 'table_name'
-- TWO-ARGUMENT VERSION = single ID column
(basemap_table, main_id) AS TABLE (
  WITH t1 AS (
      FROM query_table(basemap_table)
      SELECT count() as count
    ) FROM query_table(basemap_table), t1
      SELECT
        "main_id" as raw,
        "main_id" as id,
        "main_id" as variant,
        normalize_text_join(CAST("main_id" AS VARCHAR)) as normalized,
        basemap_table as basemap,
        t1.count as basemap_count
    ),
-- THREE-ARGUMENT VERSION = main ID + one or more secondary IDs
(basemap_table, main_id, others_id) AS TABLE (
  WITH t1 AS (
    FROM query_table(basemap_table)
    SELECT count() as count
  ), t2 AS (
    FROM query_table(basemap_table), t1
    SELECT
      "main_id" as id,
      "main_id",
      COLUMNS(others_id),
    ), t3 AS (
      UNPIVOT t2
      ON COLUMNS(* EXCLUDE (id))
      INTO
        NAME variant
        VALUE raw
    ) FROM t3, t1
      SELECT
        raw,
        id,
        variant,
        normalize_text_join(CAST(raw AS VARCHAR)) as normalized,
        basemap_table as basemap,
        t1.count as basemap_count,
      ORDER BY variant, raw
);`;

/**
 * SQL macro for generating a synthesis of join results.
 *
 * @param tabname - The name of the table containing the join results.
 * @returns A table with: basemap, share_basemap, share_candidate.
 * @note Assumes the join results table has columns `basemap`, `basemap_count`, and `candidate_count`.
 */
const join_synthesis_macro = `CREATE OR REPLACE MACRO join_synthesis(tabname) AS TABLE (
  FROM query_table(tabname)
  SELECT
    basemap,
    count()::DOUBLE / basemap_count as share_basemap,
    count()::DOUBLE / candidate_count as share_candidate
  GROUP BY basemap, basemap_count, candidate_count
  ORDER BY share_basemap DESC
);`;

/**
 * SQL macro that applies a join operation across basemaps based on similarity
 * between a geoname column in a candidates table and a join table.
 *
 * The macro works by:
 * 1. Selecting the geoname column from the candidates table and counting total candidates.
 * 2. Joining candidate geonames with the join table using the similarity function.
 * 3. Ordering results by basemap, geoname, and score descending.
 * 4. Removing duplicates on the join side by keeping only the best score for each basemap and id.
 *
 * @param candidates_table - The name of the table containing candidate geonames.
 * @param geoname_column - The name of the column containing the geonames.
 * @param join_table - The name of the table to join with, containing basemap data.
 * @returns A table with the best matching basemap for each geoname.
 */
const apply_join_across_basemaps_macro = `CREATE OR REPLACE MACRO apply_join_across_basemaps(candidates_table, geoname_column, join_table) AS TABLE (
    WITH t1 AS (
        FROM query_table(candidates_table)
        SELECT
            CAST("geoname_column" AS VARCHAR) as geoname,
            count() over() as candidate_count -- used later in synthesis figures
    ), t2 AS (
        FROM t1, LATERAL (SELECT * FROM get_similarity(geoname, join_table))
        SELECT *
        ORDER BY basemap, geoname, score DESC
    ) -- Remove duplicates on the join side by keeping only the best score
    FROM t2
    SELECT unnest(max_by(t2, score, 1), recursive := true)
    GROUP BY basemap, id
);`;

export const join_macros =
  normalize_text_join_macro +
  get_similarity_macro +
  analyze_join_quality_macro +
  apply_join_across_basemaps_macro +
  get_join_table_from_basemap_macro +
  join_synthesis_macro;
