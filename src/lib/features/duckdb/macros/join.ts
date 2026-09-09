/**
 * SQL macro that normalizes a text string by applying NFC normalization,
 * stripping accents, converting to lowercase, and trimming whitespace.
 * Renamed to `normalize_text_join` to avoid collision with other normalize_text macros.
 *
 * @example SELECT normalize_text_join('Héllo Wørld!');
 */
const normalize_text_join_macro = `CREATE OR REPLACE MACRO normalize_text_join(string) AS (
    nfc_normalize(CAST(string AS VARCHAR))
        .strip_accents().lower().trim()
        .regexp_replace('[^a-z0-9]+', ' ', 'g')
        .regexp_replace('\\bste\\.?\\b', 'sainte', 'g')
        .regexp_replace('\\bst\\.?\\b', 'saint', 'g')
);`;

export const join_macros = normalize_text_join_macro;
