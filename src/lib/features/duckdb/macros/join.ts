import { FUZZY_SEARCH } from '$lib/features/commons/constants/detection.constants';

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
 * SQL macro that calculates the Jaro-Winkler similarity score between a candidate string
 * and a table of strings, categorizes the similarity into 'exact', 'partial', or 'toofar',
 * and returns all matches including 'toofar'.
 * Uses FUZZY_SEARCH.SCORE_CUTOFF for early pruning of low-similarity pairs, aligned
 * with the join grading cutoff in join-ops.ts.
 *
 * Callers are responsible for filtering out 'toofar' entries when needed.
 *
 * @param candidate - The candidate string to find similar matches for.
 * @param join_table - The name of the table to search for similar strings.
 * @returns A table with all similarity matches ordered by score descending.
 */
const get_similarity_macro = `CREATE OR REPLACE MACRO get_similarity(candidate, join_table) AS TABLE (
  WITH t0 AS (
    SELECT normalize_text_join(CAST(candidate AS VARCHAR)) as search_term
  ), t1 AS (
    -- Jaro-Winkler score on all entities across all basemaps
    -- Categorized into 3 types: exact, partial, toofar
    FROM t0, query_table(join_table)
    SELECT
      jaro_winkler_similarity(search_term, "normalized", ${FUZZY_SEARCH.SCORE_CUTOFF}) as score,
      CASE
        WHEN score = 1 THEN 'exact'
        WHEN score >= ${FUZZY_SEARCH.SCORE_CUTOFF} THEN 'partial'
        ELSE 'toofar'
      END as typo_match,
      * EXCLUDE (search_term, normalized)
  )
    FROM t1
    SELECT *
    ORDER BY score DESC
);`;

export const join_macros = normalize_text_join_macro + get_similarity_macro;
