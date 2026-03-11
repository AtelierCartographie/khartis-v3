import { FUZZY_SEARCH } from '$lib/features/commons/constants/detection.constants';

// ToDo:
// - verify handling of missing values in each method = should not be taken into account
// - verify handling of time series
// - verify handling of negative values
// - how to handle series with both signs (positive and negative)?
//   - detect dual sign
//   - apply the method independently on each sign

/**
 * SQL macro for calculating quantiles.
 *
 * Calculates quantiles for a specified column in a table. The number of quantiles
 * (default is 5) can be adjusted by providing a different value for `nb`.
 *
 * @param tabname - The name of the table to query.
 * @param colname - The name of the column for which to calculate quantiles.
 * @param nb - The number of quantiles to calculate (default is 5).
 */
const quantile_macro = `CREATE OR REPLACE MACRO quantile(tabname, colname, nb := 5) AS (
  WITH values AS (
    FROM query_table(tabname::VARCHAR)
    SELECT COLUMNS(c -> c = colname) AS value
    WHERE COLUMNS(c -> c = colname) IS NOT NULL
  )
  FROM values
  SELECT quantile_disc(value, list_transform(range(1, nb), c -> c::DOUBLE / nb))
);`;

// nb is not used, just to harmonize with the other macros
const q6_macro = `CREATE OR REPLACE MACRO q6(tabname, colname, nb := 6) AS (
    WITH values AS (
      FROM query_table(tabname::VARCHAR)
      SELECT COLUMNS(c -> c = colname) AS value
      WHERE COLUMNS(c -> c = colname) IS NOT NULL
    )
    FROM values
    SELECT quantile_disc(value, [0.05,0.275,0.5,0.725,0.95])
);`;

/**
 * SQL macro for creating equal-width bins (intervalles égaux) with an optional "nice breaks" mode.
 *
 * Calculates min and max values of the column and divides the range into `nb` bins.
 *
 * @param tabname - The name of the table.
 * @param colname - The name of the column to bin.
 * @param nb - The number of bins to create (default is 5).
 * @param nice - Whether to use "nice" bin boundaries (default is false).
 */
const equi_width_macro = `CREATE OR REPLACE MACRO equi_width(tabname, colname, nb := 5, nice := false) AS (
  WITH values AS (
    FROM query_table(tabname::VARCHAR)
    SELECT COLUMNS(c -> c = colname) AS value
    WHERE COLUMNS(c -> c = colname) IS NOT NULL
  )
  FROM values
  SELECT equi_width_bins(MIN(value), MAX(value), nb - 1, nice)
);`;

/**
 * SQL macro that calculates nested means for a given table and column.
 * Generates a list of threshold values (breaks) that iteratively includes new interstitial means.
 * By Éric Mauvière, https://observablehq.com/@ericmauviere/nested-means-avec-duckdb
 *
 * @param tabname - The name of the table to query.
 * @param colname - The name of the column to calculate means for.
 * @param nb - The number of breaks to calculate (default is 4).
 */
const nested_means_macro = `CREATE OR REPLACE MACRO nested_means(tabname, colname, nb := 4) AS (

    -- breaks is the list of thresholds, which at each iteration grows with new interstitial means
    -- breaks includes min and max, which will be removed if needed at the end of the macro


    WITH RECURSIVE values AS (
      FROM query_table(tabname::VARCHAR)
      SELECT COLUMNS(c -> c = colname) AS value
      WHERE COLUMNS(c -> c = colname) IS NOT NULL
    ), means(iter, breaks) AS (

      FROM values
      SELECT 1, [min(value), avg(value), max(value)]     -- first row: [min, average, max]

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
            FROM values
            SELECT avg(value)
            WHERE value BETWEEN b AND next_b
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
    SELECT last(breaks)[2:-2] breaks      -- remove min and max
);`;

// By Éric Mauvière, https://observablehq.com/@ericmauviere/head-tail-breaks
const headtail_macro = `CREATE OR REPLACE MACRO headtail(tabname, colname, nb := 10, threshold := ${FUZZY_SEARCH.HEAD_TAIL_THRESHOLD}) AS (
              WITH RECURSIVE values AS (
                    FROM query_table(tabname::VARCHAR)
                    SELECT COLUMNS(c -> c = colname) AS value
                    WHERE COLUMNS(c -> c = colname) IS NOT NULL
              ), headtail(break, values_count) AS (
                    -- Initialization with break = average, values_count = number of observations
                    FROM values
                    SELECT avg(value),   -- break
                    count(*)              -- values_count

                    UNION ALL

                    -- next headtail refers to the last row of the growing table
                    FROM values, headtail
                    SELECT avg(value),    -- next break
                    count(*) head_count    -- next values_count
                    WHERE value > headtail.break
                    GROUP BY ALL
                    HAVING head_count > 1 AND head_count / headtail.values_count <= threshold
            )
            FROM headtail
            SELECT list(break)[1:nb - 1] AS breaks
        );`;

const headtail2_macro = `CREATE OR REPLACE MACRO headtail2(tabname, colname, nb := 10, threshold := ${FUZZY_SEARCH.HEAD_TAIL_THRESHOLD}) AS (
              WITH RECURSIVE values AS (
                  FROM query_table(tabname::VARCHAR)
                  SELECT COLUMNS(c -> c = colname) AS value
                  WHERE COLUMNS(c -> c = colname) IS NOT NULL
              ), headtail(break, values_count, l_pct_head) AS (
                  FROM values
                  SELECT avg(value),
                  count(*),
                  []::double[]

                  UNION ALL (
                    WITH t1 AS (
                      FROM values, headtail
                      SELECT avg(value) next_break,
                      count(*) h_count,
                      headtail.values_count v_count,
                      headtail.l_pct_head l
                      WHERE value > headtail.break
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

// By Éric Mauvière,
// for a visual explanation of the method: https://www.youtube.com/watch?v=5I3Ei69I40s
const kmeans_macro = `CREATE OR REPLACE MACRO kmeans(tabname, colname, nb := 5, maxiter := 30) AS (
  WITH RECURSIVE values AS (
    FROM query_table(tabname::VARCHAR)
    SELECT ROW_NUMBER() OVER() id, COLUMNS(c -> c = colname) AS value
    WHERE COLUMNS(c -> c = colname) IS NOT NULL
  ), clusters(iter, cid, x) AS (
    (SELECT 0, id, value FROM values LIMIT nb-1) --USING SAMPLE 10% (bernoulli) --USING SAMPLE nb-1
    UNION ALL
    SELECT iter + 1, cid, avg(px) FROM (
      SELECT iter, cid, p.value as px,
      rank() OVER (PARTITION BY p.id ORDER BY (p.value-c.x)^2, c.x^2) r
      FROM values p, clusters c
    ) x
    WHERE x.r = 1 and iter < maxiter
    GROUP BY ALL
  )

  FROM (FROM clusters WHERE iter = maxiter ORDER BY x)
  SELECT list(x)
);`;

// Class membership for each value
/**
 * SQL macro to classify a column value based on specified breaks.
 *
 * Creates a temporary table with distinct break values and assigns a class number
 * to each value in the column based on its position relative to the breaks.
 * If the column value is null, the result will also be null.
 *
 * @param colname - The name of the column to classify.
 * @param breaks - An array of break values to classify the column.
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

// Rounds thresholds without betraying their relative positions in the series
/**
 * Macro script for rounding thresholds and generating rounded values within specified limits.
 *
 * Defines several sub-macros:
 * 1. `round_left(n)`: Recursively rounds the integer part of a number `n`.
 * 2. `round_right(n)`: Recursively rounds the decimal part of a number `n`.
 * 3. `generate_roundings(n)`: Generates a list of rounded values by concatenating round_left and round_right.
 * 4. `best_value_rounded(n, lower_limit, upper_limit)`: Selects the best-rounded value within limits.
 * 5. `round_thresholds(breaks, tname, colname)`: Rounds the thresholds for a given set of breaks.
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
  WITH values AS (
    FROM query_table(tname::VARCHAR)
    SELECT COLUMNS(c -> c = colname) AS value
    WHERE COLUMNS(c -> c = colname) IS NOT NULL
  ), t1 AS (
    SELECT unnest(breaks) AS break
  ), t2 AS (
    FROM t1, values
    SELECT
      break,
      max(value) FILTER (WHERE value <= break) AS lower_limit,
      min(value) FILTER (WHERE value >= break) AS upper_limit
    GROUP BY ALL
  )
  FROM t2
  SELECT list(best_value_rounded(break, lower_limit, upper_limit)).list_sort()
);`;

/**
 * Combination of all macro functions for data classification:
 * quantile, q6, equi_width, nested_means, headtail, headtail2, kmeans, add_class, round_thresholds.
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
