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
export const search_macros = `CREATE OR REPLACE MACRO normalize_text(s) AS (
	lower(strip_accents(regexp_replace(trim(coalesce(s::VARCHAR, '')), '[^a-zA-Z0-9]', ' ', 'g')))
);`;
