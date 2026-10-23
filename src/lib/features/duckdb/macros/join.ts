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

/**
 * Aggregate over the distinct values of a join source column: true when the
 * column holds code identifiers (INSEE, NUTS, ISO3...), between which fuzzy
 * similarity is noise ('85271' ≈ '85212'). Codes are columns whose values all
 * cast to a number, or fixed-length values that are structurally code-like:
 * each contains a digit, or all are uppercase alphabetic codes of at most
 * 3 characters (ISO2/ISO3). A shared length alone is not enough because
 * distinct place names can have equal lengths. Both table-to-basemap and
 * table-to-table joins skip their fuzzy phase on such a column.
 *
 * @example SELECT is_code_column(normalized, raw) FROM candidates;
 */
const is_code_column_macro = `CREATE OR REPLACE MACRO is_code_column(normalized, original) AS (
    COUNT(*) FILTER (WHERE TRY_CAST(normalized AS DOUBLE) IS NULL) = 0
    OR (
        COUNT(DISTINCT length(normalized)) = 1
        AND MAX(length(normalized)) <= 8
        AND COUNT(DISTINCT normalized) >= 3
        AND (
            COUNT(*) FILTER (WHERE regexp_matches(original, '[0-9]')) = COUNT(*)
            OR (
                MAX(length(normalized)) <= 3
                AND COUNT(*) FILTER (WHERE original = upper(original)) = COUNT(*)
            )
        )
    )
);`;

export const join_macros = normalize_text_join_macro + is_code_column_macro;
