// ToDo :
// - vérifier la gestion des valeurs manquantes dans chaque méthode = ne doit pas être prise en compte
// - vérifier la gestion des séries temporelles
// - vérifier la gestion des valeurs négatives
// - comment gérer les séries à double signes (positive et négative) ?
//   - détecter le double signe
//   - appliquer la méthode indépendemment sur chaque signe

/**
 * A SQL macro for calculating quantiles.
 *
 * This macro creates or replaces a macro named `quantile` that calculates
 * quantiles for a specified column in a table. The number of quantiles
 * (default is 5) can be adjusted by providing a different value for `nb`.
 *
 * @macro
 * @param {string} tabname - The name of the table to query.
 * @param {string} colname - The name of the column for which to calculate quantiles.
 * @param {number} [nb=5] - The number of quantiles to calculate (default is 5).
 * @returns {string} The SQL macro definition for calculating quantiles.
 */
const quantile_macro = `CREATE OR REPLACE MACRO quantile(tabname, colname, nb := 5) AS (
  FROM query(tabname)
  SELECT quantile_disc("colname", list_transform(range(1, nb), c -> c / nb))
);`;

// nb n'est pas utilisé, juste pour harmoniser avec les autres macros
const q6_macro = `CREATE OR REPLACE MACRO q6(tabname, colname, nb := 6) AS (
    FROM query(tabname)
    SELECT quantile_disc("colname", [0.05,0.275,0.5,0.725,0.95])
);`;

/**
 * SQL macro for creating equal-width bins.
 * Intervalles égaux avec option de "nice" breaks
 *
 * This macro generates SQL code to create equal-width bins for a specified column in a table.
 * It calculates the minimum and maximum values of the column and divides the range into
 * a specified number of bins.
 *
 * @constant {string} equi_width_macro - The SQL macro definition.
 * @param {string} tabname - The name of the table.
 * @param {string} colname - The name of the column to bin.
 * @param {number} [nb=5] - The number of bins to create. Default is 5.
 * @param {boolean} [nice=false] - Whether to use "nice" bin boundaries. Default is false.
 */
const equi_width_macro = `CREATE OR REPLACE MACRO equi_width(tabname, colname, nb := 5, nice := false) AS (
  FROM query(tabname)
  SELECT equi_width_bins(MIN("colname"), MAX("colname"), nb - 1, nice)
);`;

/**
 * SQL macro to create or replace a macro named `nested_means` that calculates nested means for a given table and column.
 * The function generates a list of threshold values (breaks) that iteratively includes new interstitial means.
 * By Éric Mauvière, https://observablehq.com/@ericmauviere/nested-means-avec-duckdb
 *
 * @param {string} tabname - The name of the table to query.
 * @param {string} colname - The name of the column to calculate means for.
 * @param {number} [nb=4] - The number of breaks to calculate. Defaults to 4.
 *
 * @returns {string} - The SQL macro string to create or replace the `nested_means` function.
 */
const nested_means_macro = `CREATE OR REPLACE MACRO nested_means(tabname, colname, nb := 4) AS (
                
    -- breaks est la liste des seuils, qui à chaque itération s'augmente des moyennes interstitielles nouvelles
    -- breaks comprend le min et le max, qu'on retirera au besoin en fin de macro
    
    WITH RECURSIVE means(iter, breaks) AS (
      
      FROM query(tabname) 
      SELECT 1, [min("colname"), avg("colname"), max("colname")]     -- première ligne : [min, moyenne, max]
      
      UNION ALL (
        
        WITH t1 AS (
          FROM means SELECT unnest(breaks) b
        ), t2 AS (
          FROM t1 
          SELECT b, lead(b) over(ORDER BY b) next_b  
          QUALIFY next_b IS NOT null
        ), t3 AS (
          FROM t2
          SELECT b, (
            FROM query(tabname) SELECT avg("colname")  
            WHERE "colname" BETWEEN b AND next_b
          ) new_break
        ), t4 AS (
          FROM t3 
          SELECT list(new_break) new_breaks
        ) FROM t4, means 
          SELECT means.iter + 1, 
          list_concat(means.breaks, new_breaks).list_sort()
          WHERE means.iter < log(nb)/log(2) 
          GROUP BY all
      )
    ) 

    FROM means 
    SELECT last(breaks)[2:-2] breaks      -- retrait min et max
);`;

// Par Éric Mauvière, https://observablehq.com/@ericmauviere/head-tail-breaks
const headtail_macro = `CREATE OR REPLACE FUNCTION headtail(tabname, colname, nb := 10, threshold := 0.4) AS (
              WITH RECURSIVE headtail(break, values_count) AS (
                    -- Initialisation avec break = moyenne, values_count = nb d'observations 
                    FROM query(tabname)
                    SELECT avg("colname"),   -- break
                    count(*)              -- values_count
                      
                    UNION ALL
                    
                    -- headtail suivant se réfère à la dernière ligne de la table en cours de croissance
                    FROM query(tabname), headtail
                    SELECT avg("colname"),    -- next break
                    count(*) head_count    -- next values_count
                    WHERE "colname" > headtail.break
                    GROUP BY ALL
                    HAVING head_count > 1 AND head_count / headtail.values_count <= threshold
            ) 
            FROM headtail 
            SELECT list(break)[1:nb - 1] AS breaks
        );`;

const headtail2_macro = `CREATE OR REPLACE FUNCTION headtail2(tabname, colname, nb := 10, threshold := 0.4) AS (
              WITH RECURSIVE headtail(break, values_count, l_pct_head) AS (
                  FROM query(tabname)
                  SELECT avg("colname"),
                  count(*),
                  []::double[]

                  UNION ALL (
                    WITH t1 AS (
                      FROM query(tabname), headtail
                      SELECT avg("colname") next_break,
                      count(*) h_count,
                      headtail.values_count v_count,
                      headtail.l_pct_head l
                      WHERE "colname" > headtail.break
                      GROUP BY ALL
                    )
                    FROM t1
                    SELECT next_break, h_count,
                    list_append(l, h_count / v_count) next_l
                    WHERE h_count > 1 AND list_avg(next_l) <= threshold
                  )
              ) 
              FROM headtail 
              SELECT list(break)[1:nb - 1] AS breaks 
        );`;

// Par Éric Mauvière,
// pour une explication visuelle de la méthode : https://www.youtube.com/watch?v=5I3Ei69I40s
const kmeans_macro = `CREATE OR REPLACE MACRO kmeans(tabname, colname, nb := 5, maxiter := 30) AS (
  WITH RECURSIVE clusters(iter, cid, x) AS ( 
    WITH t1 AS (
      FROM query(tabname) 
      SELECT ROW_NUMBER() OVER() id, "colname" AS x
    )
    (SELECT 0, id, x FROM t1 LIMIT nb-1) --USING SAMPLE 10% (bernoulli) --USING SAMPLE nb-1 
    UNION ALL 
    SELECT iter + 1, cid, avg(px) FROM ( 
      SELECT iter, cid, p.x as px, 
      rank() OVER (PARTITION BY p.id ORDER BY (p.x-c.x)^2, c.x^2) r
      FROM t1 p, clusters c
    ) x 
    WHERE x.r = 1 and iter < maxiter 
    GROUP BY ALL
  )
  
  FROM (FROM clusters WHERE iter = maxiter ORDER BY x)
  SELECT list(x) 
);`;

// Appartenance à une classe pour chaque valeur
/**
 * SQL macro to classify a column value based on specified breaks.
 *
 * This macro creates a temporary table with distinct break values and assigns
 * a class number to each value in the column based on its position relative to
 * the breaks. If the column value is null, the result will also be null.
 *
 * @macro
 * @param {string} colname - The name of the column to classify.
 * @param {Array<number|string>} breaks - An array of break values to classify the column.
 * @returns {string} The SQL macro definition for classifying the column.
 */
const add_class_macro = `CREATE OR REPLACE MACRO add_class(colname, breaks) AS (
	WITH t1 AS (
		SELECT unnest(list_distinct(breaks)) as break
	), t2 AS (
		FROM t1
		SELECT COUNT(*) + 1 as class
	  WHERE try_cast(break as double) <= try_cast("colname" as double)
	) FROM t2 
	SELECT IF("colname" IS NULL, NULL, class) 
);`;

// Arrondi les seuils sans trahir leurs positions relatives dans la série
/**
 * A macro script for rounding thresholds and generating rounded values within specified limits.
 *
 * This script defines several macros:
 *
 * 1. `round_left(n)`: Recursively rounds integer part of a number `n`.
 * 2. `round_right(n)`: Recursively rounds decimal part of a number `n`.
 * 3. `generate_roundings(n)`: Generates a list of rounded values for a number `n` by concatenating the results of `round_left` and `round_right`.
 * 4. `best_value_rounded(n, lower_limit, upper_limit)`: Selects the best-rounded value for `n` that falls within the specified `lower_limit` and `upper_limit`.
 * 5. `round_thresholds(breaks, tname, colname)`: Rounds the thresholds for a given set of breaks, table name, and column name.
 *
 * @constant {string} round_thresholds_macro - The macro script for rounding thresholds.
 */
const round_thresholds_macro = `CREATE OR REPLACE MACRO round_left(n) AS (
  WITH RECURSIVE round_left(value, value_rounded, iter) AS (
    SELECT 
      n::double,
      round(n::double, 0),
      0 - 1
    UNION ALL
    FROM round_left
    SELECT
      value,
      round(value, iter),
      iter - 1
    WHERE value_rounded <> 0
  )
  FROM round_left
  SELECT list(value_rounded).list_reverse()
  WHERE value_rounded <> 0
  );
  
  CREATE OR REPLACE MACRO round_right(n) AS (
  WITH RECURSIVE round_right(value, value_rounded, iter) AS (
    SELECT 
      n::double,
      round(n::double, 1),
      1 + 1
    UNION ALL
    FROM round_right
    SELECT
      value,
      round(value, iter),
      iter + 1
    WHERE value <> value_rounded
  )
  FROM round_right
  SELECT list(value_rounded)
  WHERE value_rounded <> 0
  );
  
  CREATE OR REPLACE MACRO generate_roundings (n) AS (
  SELECT if(n = 0, [0], list_concat(round_left(n), round_right(n)))
  );
  
  CREATE OR REPLACE MACRO best_value_rounded(n, lower_limit, upper_limit) AS (
    WITH t1 AS (
      SELECT
        UNNEST(generate_roundings(n)) AS value_rounded,
        value_rounded BETWEEN lower_limit AND upper_limit AS check_inside
    )
    FROM t1
    SELECT value_rounded
    WHERE check_inside = TRUE 
    LIMIT 1
    
  );
  
  CREATE OR REPLACE MACRO round_thresholds(breaks, tname, colname) AS (
  WITH t1 AS (
    SELECT unnest(breaks) AS break
  ), t2 AS (
    FROM t1, query_table(tname)
    SELECT
      break,
      max("colname") FILTER("colname" <= break) AS lower_limit,
      min("colname") FILTER("colname" >= break) AS upper_limit
    GROUP BY ALL
  )
  FROM t2
  SELECT list(best_value_rounded(break, lower_limit, upper_limit)).list_sort()
);`;

/**
 * A combination of various macro functions for data classification.
 *
 * This constant is a concatenation of several macros:
 * - `quantile_macro`
 * - `q6_macro`
 * - `equi_width_macro`
 * - `nested_means_macro`
 * - `headtail_macro`
 * - `headtail2_macro`
 * - `kmeans_macro`
 * - `get_class_macro`
 * - `round_thresholds_macro`
 *
 * These macros are used for different methods of data classification and thresholding.
 */
export const breaks =
	quantile_macro +
	q6_macro +
	equi_width_macro +
	nested_means_macro +
	headtail_macro +
	headtail2_macro +
	kmeans_macro +
	add_class_macro +
	round_thresholds_macro;
