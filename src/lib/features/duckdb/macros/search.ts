import { FUZZY_SEARCH } from '$lib/features/commons/constants/detection.constants';

const normalize_text_macro = `CREATE OR REPLACE MACRO normalize_text(s) AS (
	lower(strip_accents(regexp_replace(trim(coalesce(s::VARCHAR, '')), '[^a-zA-Z0-9]', ' ', 'g')))
);`;

const search_exact_macro = `CREATE OR REPLACE MACRO searchExact(tabname, search_query, max_results := 500) AS TABLE (
  WITH term_wrapper AS (
    SELECT normalize_text(search_query) AS term
  ),
  text_columns AS (
    SELECT column_name
    FROM duckdb_columns()
    WHERE table_name = tabname
      AND column_name != '__id'
      AND data_type IN ('VARCHAR', 'TEXT', 'STRING')
  ),
  vertical_data AS (
    UNPIVOT (FROM query_table(tabname))
    ON COLUMNS(* EXCLUDE (__id))::VARCHAR
    INTO
      NAME column_name
      VALUE column_value
  ),
  filtered_vertical AS (
    SELECT v.*
    FROM vertical_data v
    WHERE v.column_name IN (SELECT column_name FROM text_columns)
      AND v.column_value IS NOT NULL
      AND length(trim(v.column_value)) > 0
  )
  SELECT
    v.__id,
    v.column_name,
    v.column_value,
    CASE
      WHEN normalize_text(v.column_value) = (SELECT term FROM term_wrapper) THEN 1.0
      ELSE 0.99
    END AS score
  FROM filtered_vertical v, term_wrapper t
  WHERE normalize_text(v.column_value) = t.term
     OR contains(normalize_text(v.column_value), t.term)
  ORDER BY score DESC, __id ASC
  LIMIT max_results
);`;

const search_fuzzy_macro = `CREATE OR REPLACE MACRO searchFuzzy(tabname, search_query, threshold := ${FUZZY_SEARCH.DEFAULT_SIMILARITY}, max_results := 500) AS TABLE (
  WITH term_wrapper AS (
    SELECT normalize_text(search_query) AS term
  ),
  text_columns AS (
    SELECT column_name
    FROM duckdb_columns()
    WHERE table_name = tabname
      AND column_name != '__id'
      AND data_type IN ('VARCHAR', 'TEXT', 'STRING')
  ),
  vertical_data AS (
    UNPIVOT (FROM query_table(tabname))
    ON COLUMNS(* EXCLUDE (__id))::VARCHAR
    INTO
      NAME column_name
      VALUE column_value
  ),
  filtered_vertical AS (
    SELECT v.*
    FROM vertical_data v
    WHERE v.column_name IN (SELECT column_name FROM text_columns)
      AND v.column_value IS NOT NULL
      AND length(trim(v.column_value)) > 0
  ),
  exact_ids AS (
    SELECT DISTINCT v.__id, v.column_name
    FROM filtered_vertical v, term_wrapper t
    WHERE normalize_text(v.column_value) = t.term
       OR contains(normalize_text(v.column_value), t.term)
  )
  SELECT
    v.__id,
    v.column_name,
    v.column_value,
    jaro_winkler_similarity(normalize_text(v.column_value), t.term) AS score
  FROM filtered_vertical v, term_wrapper t
  WHERE NOT EXISTS (
      SELECT 1 FROM exact_ids e
      WHERE e.__id = v.__id AND e.column_name = v.column_name
    )
    AND length(normalize_text(v.column_value)) BETWEEN length(t.term) * 0.5 AND length(t.term) * 2
    AND jaro_winkler_similarity(normalize_text(v.column_value), t.term) > threshold
  ORDER BY score DESC, __id ASC
  LIMIT max_results
);`;

export const search_macros = `${normalize_text_macro}
${search_exact_macro}
${search_fuzzy_macro}`;
