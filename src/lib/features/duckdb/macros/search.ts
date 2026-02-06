const normalize_text_macro = `CREATE OR REPLACE MACRO normalize_text(s) AS (
	lower(strip_accents(regexp_replace(trim(coalesce(s::VARCHAR, '')), '[^a-zA-Z0-9]', ' ', 'g')))
);`;

export const search_macros = normalize_text_macro;
