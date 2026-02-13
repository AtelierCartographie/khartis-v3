/**
 * @constant {string} normalize_text_macro
 * @description SQL macro for search normalization.
 * It lowercases and removes diacritics after trimming and replacing
 * non-alphanumeric characters with spaces.
 *
 * @param {string} s - Raw text to normalize.
 * @returns {string} Normalized text used for fuzzy matching and comparisons.
 */
const normalize_text_macro = `CREATE OR REPLACE MACRO normalize_text(s) AS (
	lower(strip_accents(regexp_replace(trim(coalesce(s::VARCHAR, '')), '[^a-zA-Z0-9]', ' ', 'g')))
);`;

export const search_macros = normalize_text_macro;
