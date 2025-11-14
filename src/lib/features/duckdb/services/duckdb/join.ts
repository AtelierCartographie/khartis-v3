const normalize_text_macro = `CREATE OR REPLACE MACRO normalize_text(string) AS (
    SELECT
        nfc_normalize(string).strip_accents().lower().trim()
    );`;

const get_similarity_macro = `CREATE OR REPLACE MACRO get_similarity(candidate, join_table) AS TABLE (
  WITH t0 AS (
    SELECT normalize_text(candidate) as search_term
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
    SELECT
      unnest(max_by(t1, score, 1), recursive := true)
      WHERE typo_match <> 'toofar'
      GROUP BY basemap
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
        normalize_text("main_id") as normalized,
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
        normalize_text(raw) as normalized,
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

export const join_macros =
  normalize_text_macro +
  get_similarity_macro +
  apply_join_across_basemaps_macro +
  get_join_table_from_basemap_macro +
  join_synthesis_macro;
