/**
 * DuckDB macro for text normalization used in fuzzy search.
 *
 * Normalizes text by:
 * - Converting to lowercase
 * - Stripping accents
 * - Replacing non-alphanumeric characters with spaces
 * - Trimming whitespace
 * - Handling null values
 */
export const normalize_text_macro = `CREATE OR REPLACE MACRO normalize_text(s) AS (
	lower(strip_accents(regexp_replace(trim(coalesce(s::VARCHAR, '')), '[^a-zA-Z0-9]', ' ', 'g')))
);`;

/**
 * DuckDB table macro for cell-level search using UNPIVOT.
 *
 * Transposes the table to search across all columns efficiently.
 * Scoring:
 * - 1.0: Exact match (normalized)
 * - 0.99: Contains match (substring found in cell)
 * - <0.99: Fuzzy match (Jaro-Winkler similarity)
 */
export const search_table_macro = `CREATE OR REPLACE MACRO searchInTable(tabname, search_query, threshold := 0.85, max_results := 500) AS TABLE (
  WITH term_wrapper AS (
    SELECT normalize_text(search_query) AS term
  ),
  vertical_data AS (
    UNPIVOT (FROM query_table(tabname))
    ON COLUMNS(* EXCLUDE (__id))::VARCHAR
    INTO
      NAME column_name
      VALUE column_value
  ),
  scored_cells AS (
    FROM vertical_data v, term_wrapper t
    SELECT
        v.__id,
        v.column_name,
        v.column_value,
        CASE
            WHEN normalize_text(v.column_value) = t.term THEN 1.0
            WHEN contains(normalize_text(v.column_value), t.term) THEN 0.99
            ELSE jaro_winkler_similarity(normalize_text(v.column_value), t.term)
        END AS score
  )
  SELECT *
  FROM scored_cells
  WHERE score > threshold
  ORDER BY score DESC, __id ASC
  LIMIT max_results
);`;

export const search_macros = `${normalize_text_macro}
${search_table_macro}`;
