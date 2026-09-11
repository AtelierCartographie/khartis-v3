import { FUZZY_SEARCH } from '$lib/features/commons/constants/detection.constants';

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
  SELECT equi_width_bins(MIN(value), MAX(value), nb, nice)
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

/**
 * SQL macro for natural-breaks classification via deterministic 1-D k-means.
 *
 * Runs Lloyd's algorithm on the distinct values weighted by their multiplicity:
 * `nb` clusters seeded on distinct-value quantiles (independent of physical row
 * order), each value assigned to a single nearest centroid (ties go to the
 * lowest centroid), iterated until the centroids stop moving or `maxiter` is
 * reached. Returns the nb-1 inter-cluster midpoints
 * (max of lower cluster + min of upper cluster) / 2, which keeps every break in
 * the empty interval between observed values so it composes with
 * `round_thresholds` and the [a, b[ classing convention.
 *
 * @param tabname - The name of the table to query.
 * @param colname - The name of the column to classify.
 * @param nb - The number of classes (default is 5); clusters = nb exactly.
 * @param maxiter - Iteration cap guarding convergence (default is 30).
 */
const kmeans_macro = `CREATE OR REPLACE MACRO kmeans(tabname, colname, nb := 5, maxiter := 30) AS (
  WITH RECURSIVE values AS (
    FROM query_table(tabname::VARCHAR)
    SELECT COLUMNS(c -> c = colname)::DOUBLE AS value, count(*) AS cnt
    WHERE COLUMNS(c -> c = colname) IS NOT NULL
    GROUP BY ALL
  ), seeds AS (
    FROM values
    SELECT list_sort(list_distinct(
      quantile_disc(value, list_transform(range(0, nb), i -> (2*i + 1)::DOUBLE / (2*nb)))
    )) AS centroids
  ), iters(iter, centroids) AS (
    FROM seeds SELECT 0, centroids
    UNION ALL
    (
      WITH expanded AS (
        FROM iters, values
        SELECT iter, centroids, value, cnt, unnest(centroids) AS cx
      ), nearest AS (
        FROM expanded
        SELECT iter, centroids, value, cnt, cx,
          row_number() OVER (PARTITION BY value ORDER BY abs(value - cx), cx) AS r
      ), updated AS (
        FROM nearest
        SELECT iter, centroids, sum(value * cnt) / sum(cnt) AS x
        WHERE r = 1
        GROUP BY iter, centroids, cx
      )
      FROM updated
      SELECT iter + 1, list(x ORDER BY x) AS next_centroids
      GROUP BY iter, centroids
      HAVING iter < maxiter AND next_centroids <> centroids
    )
  ), final AS (
    FROM iters
    SELECT centroids
    ORDER BY iter DESC
    LIMIT 1
  ), assigned AS (
    FROM (
      FROM final, values
      SELECT value, unnest(centroids) AS cx
    )
    SELECT value, cx,
      row_number() OVER (PARTITION BY value ORDER BY abs(value - cx), cx) AS r
  ), bounds AS (
    FROM assigned
    SELECT cx, min(value) AS lo, max(value) AS hi
    WHERE r = 1
    GROUP BY cx
  ), mids AS (
    FROM bounds
    SELECT (hi + lead(lo) OVER (ORDER BY cx)) / 2 AS brk
    QUALIFY brk IS NOT NULL
  )
  FROM mids
  SELECT list(brk ORDER BY brk)
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
 *
 * Each threshold is rounded inside the gap between its neighbouring observed values, so no row
 * changes class, and inside the midpoints to its neighbouring thresholds, so two thresholds
 * sharing a sparse gap can never round onto the same value and merge their classes.
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
    list_filter(
      generate_roundings(n),
      value_rounded -> value_rounded BETWEEN lower_limit AND upper_limit
    )[1]
  );

  CREATE OR REPLACE MACRO round_thresholds(breaks, tname, colname) AS (
  WITH values AS (
    FROM query_table(tname::VARCHAR)
    SELECT COLUMNS(c -> c = colname) AS value
    WHERE COLUMNS(c -> c = colname) IS NOT NULL
  ), t1 AS (
    SELECT unnest(breaks) AS break
  ), t2 AS (
    FROM t1
    SELECT
      break,
      coalesce(
        (break + lag(break) OVER (ORDER BY break)) / 2,
        '-infinity'::DOUBLE
      ) AS lower_gate,
      coalesce(
        (break + lead(break) OVER (ORDER BY break)) / 2,
        'infinity'::DOUBLE
      ) AS upper_gate
  ), t3 AS (
    FROM t2, values
    SELECT
      break,
      greatest(max(value) FILTER (WHERE value <= break), lower_gate) AS lower_limit,
      least(min(value) FILTER (WHERE value >= break), upper_gate) AS upper_limit
    GROUP BY break, lower_gate, upper_gate
  )
  FROM t3
  SELECT list(best_value_rounded(break, lower_limit, upper_limit)).list_sort()
);`;

/**
 * SQL macros for rounding the outer bounds of a discretization scale.
 *
 * Defines:
 * 1. `significant_rounding_limit(n)`: the largest deviation a rounding of `n` may show, which caps
 *    the ladder at two significant digits (one below 10) exactly like the legend's `round_extreme`.
 * 2. `round_bounds(low, high, tname, colname)`: rounds the series minimum and maximum.
 *
 * The minimum is rounded while it stays below the next observed value and the maximum while it
 * stays above the previous one, so a rounded bound can never swallow a second value: the extreme
 * value itself is the only one it can ever step over. Both bounds are display values; classes are
 * assigned from the thresholds, never from them.
 */
const round_bounds_macro = `CREATE OR REPLACE MACRO significant_rounding_limit(n) AS (
  0.5 * pow(10, floor(log10(nullif(abs(n::DOUBLE), 0))) - if(abs(n::DOUBLE) < 10, 0, 1))
  );

  CREATE OR REPLACE MACRO round_bounds(low, high, tname, colname) AS (
  WITH values AS (
    FROM query_table(tname::VARCHAR)
    SELECT COLUMNS(c -> c = colname) AS value
    WHERE COLUMNS(c -> c = colname) IS NOT NULL
  ), neighbours AS (
    FROM values
    SELECT
      min(value) FILTER (WHERE value > low) AS above_low,
      max(value) FILTER (WHERE value < high) AS below_high
  )
  FROM neighbours
  SELECT [
    coalesce(
      list_filter(
        generate_roundings(low),
        candidate -> candidate < above_low
          AND abs(candidate - low) <= significant_rounding_limit(low)
      )[1],
      low::DOUBLE
    ),
    coalesce(
      list_filter(
        generate_roundings(high),
        candidate -> candidate > below_high
          AND abs(candidate - high) <= significant_rounding_limit(high)
      )[1],
      high::DOUBLE
    )
  ]
);`;

/**
 * Combination of all macro functions for data classification:
 * quantile, q6, equi_width, nested_means, headtail2, kmeans, round_thresholds, round_bounds.
 */
export const breaks =
  quantile_macro +
  q6_macro +
  equi_width_macro +
  nested_means_macro +
  headtail2_macro +
  kmeans_macro +
  round_thresholds_macro +
  round_bounds_macro;
