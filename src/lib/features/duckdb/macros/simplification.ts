/**
 * DuckDB macros for topology-aware geometry simplification.
 *
 * Eleven macros:
 * 1. `snap_topology_normalized` – aligns vertices on a dynamic grid to clean
 *    micro gaps/overlaps before simplification.
 * 2. `simplify_topology_normalized` – coverage-based simplification preserving topology,
 *    with a normalized factor (0.0 = original, 1.0 = max simplification).
 * 3. `prune_triangles` – removes small triangle artefacts produced by aggressive simplification.
 * 4. `noded_coverage` – re-nodes a polygon coverage GEOS cannot overlay as is.
 * 5. `extract_innerlines` – derives shared internal borders from polygon coverage.
 * 6. `extract_land` – dissolves a polygon coverage into its territory outline.
 * 7. `extract_outerlines` – derives the outer contour of the whole polygon coverage.
 * 8. `simplify_and_clean` – convenience wrapper that chains snapping, simplification and cleanup.
 * 9. `snap_linestring_normalized` – aligns line vertices on a dynamic grid.
 * 10. `simplify_linestring_normalized` – simplifies line strings with a normalized factor.
 * 11. `simplify_and_clean_linestring` – convenience wrapper for line snapping + simplification.
 *
 * @see https://github.com/AtelierCartographie/khartis-v3/issues/53
 */

const snap_topology_normalized_macro = `CREATE OR REPLACE MACRO snap_topology_normalized(
    input_table,
    precision_factor := 0.00001
) AS TABLE (
    WITH
    source_data AS (
        FROM query_table(input_table)
        SELECT _gid, ST_CollectionExtract(ST_MakeValid(geom), 3) AS geom
        WHERE geom IS NOT NULL
    ),
    calc_grid AS (
        FROM source_data
        SELECT NULLIF(COALESCE(AVG(ST_Perimeter(geom)), 0.0) * precision_factor, 0.0) AS dynamic_grid_size
    )
    SELECT
        s._gid,
        COALESCE(ST_ReducePrecision(s.geom, c.dynamic_grid_size), s.geom) AS geom
    FROM source_data s, calc_grid c
);`;

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

// GEOS refuses to overlay a coverage whose neighbours share a segment traversed
// both ways: ST_Union_Agg throws \`TopologyException: found non-noded
// intersection\` and ST_MakeValid does not repair it. Snapping the vertices onto
// a grid re-nodes them. A grid expressed as a fraction of the average perimeter
// works in degrees as well as in metres.
const noded_coverage_macro = `CREATE OR REPLACE MACRO noded_coverage(
    input_table,
    noding_factor := 0.0
) AS TABLE (
    WITH
    coverage AS (
        FROM query_table(input_table)
        SELECT geom
        WHERE geom IS NOT NULL
    ),
    calc_grid AS (
        FROM coverage
        SELECT NULLIF(COALESCE(AVG(ST_Perimeter(geom)), 0.0) * noding_factor, 0.0) AS noding_grid_size
    )
    FROM coverage c, calc_grid g
    SELECT COALESCE(ST_ReducePrecision(c.geom, g.noding_grid_size), c.geom) AS geom
);`;

// Shared borders are every polygon edge that is not on the outline of the
// dissolved coverage. Deriving them by difference costs two dissolves, where
// pairwise ST_Intersection costs O(n^2) overlays: 3s versus 300s on 35k communes.
const extract_innerlines_macro = `CREATE OR REPLACE MACRO extract_innerlines(
    input_table,
    noding_factor := 0.0
) AS TABLE (
    WITH
    source_data AS (
        FROM query_table(input_table)
        SELECT ST_CollectionExtract(ST_MakeValid(geom), 3) AS geom
        WHERE geom IS NOT NULL
    ),
    noded AS (
        FROM noded_coverage(source_data, noding_factor := noding_factor)
    ),
    parts AS (
        FROM noded SELECT geom WHERE NOT ST_IsEmpty(geom)
    ),
    borders AS (
        SELECT
            ST_Union_Agg(ST_Boundary(geom)) AS all_borders,
            ST_Boundary(ST_Union_Agg(geom)) AS outline
        FROM parts
    )
    FROM borders
    SELECT ST_LineMerge(
        ST_CollectionExtract(ST_Difference(all_borders, outline), 2)
    ) AS geom
    WHERE all_borders IS NOT NULL AND NOT ST_IsEmpty(all_borders)
);`;

const extract_land_macro = `CREATE OR REPLACE MACRO extract_land(
    input_table,
    noding_factor := 0.0
) AS TABLE (
    WITH
    source_data AS (
        FROM query_table(input_table)
        SELECT ST_CollectionExtract(ST_MakeValid(geom), 3) AS geom
        WHERE geom IS NOT NULL
    ),
    noded AS (
        FROM noded_coverage(source_data, noding_factor := noding_factor)
    )
    FROM noded
    SELECT ST_Union_Agg(geom) AS geom
    WHERE NOT ST_IsEmpty(geom)
);`;

const extract_outerlines_macro = `CREATE OR REPLACE MACRO extract_outerlines(
    input_table,
    noding_factor := 0.0
) AS TABLE (
    WITH
    source_data AS (
        FROM query_table(input_table)
        SELECT ST_CollectionExtract(ST_MakeValid(geom), 3) AS geom
        WHERE geom IS NOT NULL
    ),
    noded AS (
        FROM noded_coverage(source_data, noding_factor := noding_factor)
    ),
    dissolved AS (
        SELECT ST_Union_Agg(geom) AS geom
        FROM noded
        WHERE NOT ST_IsEmpty(geom)
    )
    FROM dissolved
    SELECT ST_LineMerge(ST_CollectionExtract(ST_Boundary(geom), 2)) AS geom
    WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom)
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
    snapped AS (
        FROM snap_topology_normalized(prep_layer)
    ),
    simplified AS (
        FROM simplify_topology_normalized(snapped, simplify_factor)
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

const snap_linestring_normalized_macro = `CREATE OR REPLACE MACRO snap_linestring_normalized(
    input_table,
    precision_factor := 0.00001
) AS TABLE (
    WITH
    source_data AS (
        FROM query_table(input_table)
        SELECT _gid, geom
        WHERE geom IS NOT NULL
    ),
    calc_grid AS (
        FROM source_data
        SELECT NULLIF(COALESCE(AVG(ST_Length(geom)), 0.0) * precision_factor, 0.0) AS dynamic_grid_size
    )
    SELECT
        s._gid,
        COALESCE(ST_ReducePrecision(s.geom, c.dynamic_grid_size), s.geom) AS geom
    FROM source_data s, calc_grid c
);`;

const simplify_linestring_normalized_macro = `CREATE OR REPLACE MACRO simplify_linestring_normalized(
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
        SELECT COALESCE(AVG(ST_Length(geom)), 0.0) * normalized_factor * max_scale_ref AS computed_tolerance
    )
    SELECT
        s._gid,
        ST_Simplify(s.geom, c.computed_tolerance) AS geom
    FROM source_data s, calc_metric c
);`;

const simplify_and_clean_linestring_macro = `CREATE OR REPLACE MACRO simplify_and_clean_linestring(
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
    snapped AS (
        FROM snap_linestring_normalized(prep_layer)
    ),
    simplified AS (
        FROM simplify_linestring_normalized(snapped, simplify_factor)
    )
    SELECT
        t.* EXCLUDE (_gid, geom),
        s.geom
    FROM prep_layer t
    JOIN simplified s ON t._gid = s._gid
);`;

export const simplification_macros =
  snap_topology_normalized_macro +
  simplify_topology_normalized_macro +
  prune_triangles_macro +
  noded_coverage_macro +
  extract_innerlines_macro +
  extract_land_macro +
  extract_outerlines_macro +
  simplify_and_clean_macro +
  snap_linestring_normalized_macro +
  simplify_linestring_normalized_macro +
  simplify_and_clean_linestring_macro;
