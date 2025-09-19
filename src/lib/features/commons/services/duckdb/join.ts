/**
 * @constant {string} normalize_text_macro
 * @description SQL macro that normalizes a text string by applying NFC normalization,
 * stripping accents, converting to lowercase, and trimming whitespace.
 * @example
 * // Example usage within a SQL query:
 * SELECT normalize_text('Héllo Wørld!');
 */
const normalize_text_macro = `CREATE OR REPLACE MACRO normalize_text(string) AS (
    SELECT
        nfc_normalize(string).strip_accents().lower().trim()
    );`;

/**
 * @constant {string} get_similarity_macro
 * @description SQL macro that calculates the Jaro-Winkler similarity score between a candidate string
 * and a table of strings, categorizes the similarity into 'exact', 'partial', or 'toofar',
 * and returns the best match for each basemap.
 * @param {string} candidate - The candidate string to find similar matches for.
 * @param {string} join_table - The name of the table to search for similar strings.
 * @returns {TABLE} A table with the best similarity match for each basemap, excluding matches categorized as 'toofar'.
 * @example
 * -- Example usage within a SQL query:
 * SELECT * FROM get_similarity('Hello World', 'my_table');
 */
const get_similarity_macro = `CREATE OR REPLACE MACRO get_similarity(candidate, join_table) AS TABLE (
  WITH t0 AS (
    SELECT normalize_text(candidate) as search_term
  ), t1 AS (
    -- Calcul du score de Jaro-Winkler sur l'ensemble des entités de tous les fonds de cartes
    -- Ajout d'une typologie en 3 catégories (exact, partial, toofar)
    FROM t0, query_table(join_table)
    SELECT
      jaro_winkler_similarity(search_term, "normalized") as score,
      CASE
        WHEN score = 1 THEN 'exact'
        WHEN score >= 0.85 THEN 'partial'
        ELSE 'toofar'
      END as typo_match,
      * EXCLUDE (search_term, normalized)
  ) -- Extraction du meilleur résultat par fond de carte
    -- + déplier la structure
    -- + sortir les résultats de la catégorie 'toofar'
    FROM t1
    SELECT
      unnest(max_by(t1, score, 1), recursive := true) -- choix du nombre de résultats renvoyé
      WHERE typo_match <> 'toofar'
      GROUP BY basemap
);`;

/**
 * @const {string} apply_join_across_basemaps_macro - A DuckDB macro that applies a join operation across basemaps based on the similarity between a geoname column in a candidates table and a join
 *
 * @param {string} candidates_table - The name of the table containing candidate geonames.
 * @param {string} geoname_column - The name of the column in the candidates_table that contains the geonames.
 * @param {string} join_table - The name of the table to join with, containing basemap data and geonames.
 * @returns {table} A table with the best matching basemap for each geoname in the candidates_table, based on similarity score.
 *
 * @description
 * This macro applies a join operation across basemaps, finding the best match for each geoname in a candidate table
 * against a join table containing basemap data. It uses a similarity function to score the matches and returns
 * a table with the best matching basemap for each geoname.
 *
 * The macro works by:
 * 1. Selecting the geoname column from the candidates table and counting the total number of candidates.
 * 2. Joining the candidate geonames with the join table using a similarity function to calculate a score for each match.
 * 3. Ordering the results by basemap, geoname, and score in descending order.
 * 4. Removing duplicates on the join side by keeping only the best score for each basemap and id.
 * 5. Returning a table with the best matching basemap for each geoname.
 */
const apply_join_across_basemaps_macro = `CREATE OR REPLACE MACRO apply_join_across_basemaps(candidates_table, geoname_column, join_table) AS TABLE (
    WITH t1 AS (
        FROM query_table(candidates_table)
        SELECT
            "geoname_column" as geoname,
            count() over() as candidate_count -- utile après lors des chiffres de synthèse
    ), t2 AS (
        FROM t1, LATERAL (SELECT * FROM get_similarity(geoname, join_table))
        SELECT *
        ORDER BY basemap, geoname, score DESC
    ) -- Supprime les doublons côté joint en ne gardant que le meilleur score
    FROM t2
    SELECT unnest(max_by(t2, score, 1), recursive := true)
    GROUP BY basemap, id
);`;

/**
 * @const {string} get_join_table_from_basemap_macro
 * @description SQL macro for creating a join table from a basemap.
 * The macro has two versions: one with a single ID column and one with a main ID and additional ID columns.
 *
 * @example
 * -- Two-argument version (single ID column)
 * -- get_join_table_from_basemap('basemap_table_name', main_id_column)
 *
 * @example
 * -- Three-argument version (main ID and other ID columns)
 * -- get_join_table_from_basemap('basemap_table_name', main_id_column, list_value(['other_id_column1', 'other_id_column2']))
 *
 * @param {string} basemap_table - The name of the basemap table.  Must be provided as a string literal (e.g., 'table_name').
 * @param {string} main_id - The name of the main ID column in the basemap table.
 * @param {string} [others_id] - A comma-separated string of other ID column names in the basemap table. Optional; only used in the three-argument version.
 *
 * @returns {TABLE} A table with the following columns:
 *   - raw: The raw value of the ID.
 *   - id: The main ID.
 *   - variant: The variant of the ID (same as main ID in the two-argument version, column name in the three-argument version).
 *   - normalized: The normalized text of the raw value.
 *   - basemap: The name of the basemap table.
 *   - basemap_count: The total count of rows in the basemap table.
 *
 * @note The macro uses `normalize_text` to normalize the text of the ID values.
 */
const get_join_table_from_basemap_macro = `CREATE OR REPLACE MACRO get_join_table_from_basemap
-- ATTENTION : basemap_table doit être fourni sous forme d'une chaîne de caractères. ex : 'nom_table'
-- VERSION À DEUX ARGUMENTS = une unique colonne d'identifiant
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
-- VERSION À TROIS ARGUMENTS = un id principal et un ou plusieurs secondaires
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

/**
 * @const {string} join_synthesis_macro
 * @description SQL macro for generating a synthesis of join results.
 *
 * @param {string} table - The name of the table containing the join results.
 * @returns {TABLE} A table with the following columns:
 *   - basemap: The name of the basemap.
 *   - share_basemap: The share of the basemap in the join results.
 *   - share_candidate: The share of the candidate in the join results.
 *
 * @note The macro assumes the join results table has columns `basemap`, `basemap_count`, and `candidate_count`.
 */
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
