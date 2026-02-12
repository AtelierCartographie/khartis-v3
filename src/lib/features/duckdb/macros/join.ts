const normalize_text_join_macro = `CREATE OR REPLACE MACRO normalize_text_join(string) AS (
    nfc_normalize(string).strip_accents().lower().trim()
);`;

const get_similarity_macro = `CREATE OR REPLACE MACRO get_similarity(candidate, join_table) AS TABLE (
  WITH t0 AS (
    SELECT normalize_text_join(candidate) as search_term
  ), t1 AS (
    FROM t0, query_table(join_table)
    SELECT
      jaro_winkler_similarity(search_term, "normalized") as score,
      CASE
        WHEN score = 1 THEN 'exact'
        WHEN score >= 0.85 THEN 'partial'
        ELSE 'toofar'
      END as typo_match,
      * EXCLUDE (search_term, normalized)
  )
    FROM t1
    SELECT *
    WHERE typo_match <> 'toofar'
    ORDER BY score DESC
);`;

const analyze_join_quality_macro = `CREATE OR REPLACE MACRO analyze_join_quality(candidates_table, geoname_column, join_table) AS TABLE (
    WITH source_with_counts AS (
        SELECT
            "geoname_column" as original_name,
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
            list({id: id, name: variant, score: score, type: typo_match}) as candidates,
            max(score) as best_score,
            count(*) as match_count
        FROM matches
        GROUP BY original_name
    )
    SELECT
        c.original_name,
        c.source_dup_count,
        CASE
            WHEN c.source_dup_count > 1 THEN 'duplicate'
            WHEN bm.best_score IS NULL THEN 'not_found'
            WHEN bm.best_score = 1 AND bm.match_count = 1 THEN 'matched'
            WHEN bm.best_score = 1 AND bm.match_count > 1 THEN 'ambiguous'
            ELSE 'check'
        END as status,
        bm.candidates,
        bm.best_score
    FROM candidates c
    LEFT JOIN best_matches bm ON c.original_name = bm.original_name
);`;

const get_join_table_from_basemap_macro = `CREATE OR REPLACE MACRO get_join_table_from_basemap
(basemap_table, main_id) AS TABLE (
  WITH t1 AS (
      FROM query_table(basemap_table)
      SELECT count() as count
    ) FROM query_table(basemap_table), t1
      SELECT
        "main_id" as raw,
        "main_id" as id,
        "main_id" as variant,
        normalize_text_join("main_id") as normalized,
        basemap_table as basemap,
        t1.count as basemap_count
    ),
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
        normalize_text_join(raw) as normalized,
        basemap_table as basemap,
        t1.count as basemap_count,
      ORDER BY variant, raw
  );`;

const join_synthesis_macro = `CREATE OR REPLACE MACRO join_synthesis(tabname) AS TABLE (
  FROM query_table(tabname)
  SELECT
    basemap,
    count() / basemap_count as share_basemap,
    count() / candidate_count as share_candidate
  GROUP BY basemap, basemap_count, candidate_count
  ORDER BY share_basemap DESC
);`;

const apply_join_across_basemaps_macro = `CREATE OR REPLACE MACRO apply_join_across_basemaps(candidates_table, geoname_column, join_table) AS TABLE (
    WITH t1 AS (
        FROM query_table(candidates_table)
        SELECT
            "geoname_column" as geoname,
            count() over() as candidate_count
    ), t2 AS (
        FROM t1, LATERAL (SELECT * FROM get_similarity(geoname, join_table))
        SELECT *
        ORDER BY basemap, geoname, score DESC
    )
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
