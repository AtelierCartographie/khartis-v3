/**
 * DuckDB SQL macros for dot density cartography (issue #93).
 *
 * Three macros, all loaded once at init alongside the other macro bundles:
 *
 * 1. `get_nice_ratio(tabname, colname, max_points := 100000)` — scalar macro
 *    that picks a human-readable ratio in the 1–2–5 sequence for the given
 *    column sum and point budget.
 *
 * 2. `get_density_levels(tabname, colname, max_points := 100000)` — table
 *    macro that returns 3 rows (more / standard / less) navigating the
 *    1–2–5 sequence around the standard ratio so the UI can offer three
 *    legibility choices.
 *
 * 3. `generate_dot_density(tabname, geom_col, data_col, ratio)` — table macro
 *    that produces random POINT geometries inside each polygon using
 *    stochastic rounding + adaptive oversampling + ST_Contains rejection
 *    sampling, clamped to the stochastically-rounded target_count per feature.
 *    The output column `geometry` is encoded as `geoarrow.wkb` when exported
 *    through DuckDB ≥ 1.33, directly consumable by `geoarrow-deck-stream`.
 */

const get_nice_ratio_macro = `CREATE OR REPLACE MACRO get_nice_ratio(tabname, colname, max_points := 100000) AS (
  WITH stats AS (
    SELECT SUM("colname") AS total_data
    FROM query_table(tabname::VARCHAR)
  ),
  raw_calc AS (
    SELECT GREATEST(1, total_data / max_points::DOUBLE) AS raw_ratio FROM stats
  ),
  magnitude_calc AS (
    SELECT raw_ratio, pow(10, floor(log10(raw_ratio))) AS base_mag FROM raw_calc
  )
  SELECT
    CASE
      WHEN raw_ratio / base_mag <= 1.5 THEN 1 * base_mag
      WHEN raw_ratio / base_mag <= 3.5 THEN 2 * base_mag
      WHEN raw_ratio / base_mag <= 7.5 THEN 5 * base_mag
      ELSE 10 * base_mag
    END::INTEGER
  FROM magnitude_calc
);`;

const get_density_levels_macro = `CREATE OR REPLACE MACRO get_density_levels(tabname, colname, max_points := 100000) AS TABLE (
  WITH base AS (
    SELECT get_nice_ratio(tabname, colname, max_points) AS r
  ),
  parts AS (
    SELECT
      r,
      pow(10, floor(log10(GREATEST(r, 1)))) AS mag,
      ROUND(r / pow(10, floor(log10(GREATEST(r, 1))))) AS digit
    FROM base
  ),
  levels AS (
    SELECT
      r AS standard,
      GREATEST(1, (CASE digit
        WHEN 1 THEN 5 * (mag / 10)
        WHEN 2 THEN 1 * mag
        WHEN 5 THEN 2 * mag
        ELSE r
      END)::INTEGER) AS more,
      (CASE digit
        WHEN 1 THEN 2 * mag
        WHEN 2 THEN 5 * mag
        WHEN 5 THEN 10 * mag
        ELSE r * 2
      END)::INTEGER AS less
    FROM parts
  )
  SELECT 'more' AS level, more AS ratio FROM levels
  UNION ALL
  SELECT 'standard', standard FROM levels
  UNION ALL
  SELECT 'less', less FROM levels
);`;

const generate_dot_density_macro = `CREATE OR REPLACE MACRO generate_dot_density(tabname, geom_col, data_col, ratio) AS TABLE (
  WITH base_data AS (
    SELECT
      ROW_NUMBER() OVER () AS id,
      "geom_col" AS geom,
      "data_col" AS val
    FROM query_table(tabname::VARCHAR)
    WHERE "data_col" > 0
  ),
  bounds AS (
    SELECT
      id,
      geom,
      (FLOOR(val / ratio) +
       CASE WHEN random() < (val / ratio - FLOOR(val / ratio)) THEN 1 ELSE 0 END
      )::INTEGER AS target_count,
      ST_XMin(geom) AS xmin,
      ST_XMax(geom) AS xmax,
      ST_YMin(geom) AS ymin,
      ST_YMax(geom) AS ymax,
      GREATEST(ST_Area(geom), 0.000000001) AS poly_area
    FROM base_data
  ),
  smart_oversampling AS (
    SELECT
      *,
      GREATEST(
        2,
        CEIL(((xmax - xmin) * (ymax - ymin)) / poly_area) * 2
      )::INTEGER AS dynamic_oversample
    FROM bounds
    WHERE target_count > 0
  ),
  candidates AS (
    SELECT
      id,
      target_count,
      geom,
      unnest(generate_series(1, target_count * dynamic_oversample)) AS try_index,
      (xmin + random() * (xmax - xmin)) AS px,
      (ymin + random() * (ymax - ymin)) AS py
    FROM smart_oversampling
  ),
  valid_points AS (
    SELECT
      id, px, py, target_count, try_index
    FROM candidates
    WHERE ST_Contains(geom, ST_Point(px, py))
  ),
  final_selection AS (
    SELECT
      px,
      py,
      ROW_NUMBER() OVER (PARTITION BY id ORDER BY try_index) AS rank,
      target_count
    FROM valid_points
  )
  FROM final_selection
  SELECT ST_Point(px, py) AS geometry
  WHERE rank <= target_count
);`;

export const density_macros =
  get_nice_ratio_macro + get_density_levels_macro + generate_dot_density_macro;
