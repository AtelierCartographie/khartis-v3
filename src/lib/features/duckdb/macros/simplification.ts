/**
 * DuckDB macros for topology-aware geometry simplification.
 *
 * Three macros:
 * 1. `simplify_topology_normalized` – coverage-based simplification preserving topology,
 *    with a normalized factor (0.0 = original, 1.0 = max simplification).
 * 2. `prune_triangles` – removes small triangle artefacts produced by aggressive simplification.
 * 3. `simplify_and_clean` – convenience wrapper that chains both steps.
 *
 * @see https://github.com/AtelierCartographie/khartis-v3/issues/53
 */

const simplify_topology_normalized_macro = `CREATE OR REPLACE MACRO simplify_topology_normalized(
    input_table,
    normalized_factor,
    max_scale_ref := 0.05
) AS TABLE (
    WITH
    source_data AS (
        FROM query_table(input_table)
        SELECT _gid, geom
        WHERE geom IS NOT NULL
    ),
    calc_metric AS (
        FROM source_data
        SELECT COALESCE(AVG(ST_Perimeter(geom)), 0.0) * normalized_factor * max_scale_ref AS computed_tolerance
    ),
    ordered_data AS (
        FROM source_data
        SELECT
            list(_gid ORDER BY _gid) as gid_list,
            list(geom ORDER BY _gid) as geom_list
    ),
    dumped_data AS (
        FROM ordered_data, calc_metric
        SELECT
            gid_list,
            UNNEST(ST_Dump(ST_CoverageSimplify(geom_list, computed_tolerance))) as d
    ),
    final_reconstruction AS (
        FROM dumped_data
        SELECT
            (any_value(gid_list))[d.path[1]] as _gid,
            CASE
                WHEN max(len(d.path)) = 1 THEN first(d.geom)
                ELSE ST_Collect(list(d.geom))
            END as geom
        GROUP BY d.path[1]
    )
    FROM final_reconstruction
    ORDER BY _gid
);`;

const prune_triangles_macro = `CREATE OR REPLACE MACRO prune_triangles(input_table) AS TABLE (
    WITH
    exploded_parts AS (
        FROM query_table(input_table)
        SELECT
            _gid,
            UNNEST(ST_Dump(geom)) as d
    ),
    analyzed_parts AS (
        FROM exploded_parts
        SELECT
            _gid, d.geom as part_geom,
            (ST_NPoints(d.geom) = 4) as is_triangle,
            count(*) OVER (PARTITION BY _gid) as total_parts,
            sum((ST_NPoints(d.geom) = 4)::INT) OVER (PARTITION BY _gid) as triangle_count,
            row_number() OVER (PARTITION BY _gid ORDER BY ST_Area(d.geom) DESC) as rank_area
    ),
    filtered_parts AS (
        FROM analyzed_parts
        SELECT _gid, part_geom
        WHERE
            (NOT is_triangle)
            OR (total_parts = 1)
            OR (triangle_count = total_parts AND rank_area = 1)
    )
    FROM filtered_parts
    SELECT
        _gid,
        ST_Collect(list(part_geom)) as geom
    GROUP BY _gid
    ORDER BY _gid
);`;

const simplify_and_clean_macro = `CREATE OR REPLACE MACRO simplify_and_clean(
    input_table,
    geom_col,
    simplify_factor
) AS TABLE (
    WITH
    prep_layer AS (
        FROM query_table(input_table)
        SELECT
            row_number() OVER () as _gid,
            * RENAME ("geom_col" as geom)
    ),
    simplified AS (
        FROM simplify_topology_normalized(prep_layer, simplify_factor)
    ),
    pruned AS (
        FROM prune_triangles(simplified)
    )
    SELECT
        t.* EXCLUDE (_gid, geom),
        p.geom
    FROM prep_layer t
    JOIN pruned p ON t._gid = p._gid
);`;

export const simplification_macros =
  simplify_topology_normalized_macro +
  prune_triangles_macro +
  simplify_and_clean_macro;
