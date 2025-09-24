# Visualization & Rendering

## Types

Choropleth, Proportional Symbols, Categorical, Bivariate, Collections (facets).

## Lifecycle

Dataset → Suggestion → User config (classification/color/projection) → Layer build → Render → Legend.

## Config (Minimal)

```ts
interface VisualizationConfig {
  id: string;
  datasetId: string;
  type: VizType;
  classification?: Classification;
  color?: ColorConfig;
  proportional?: SymbolConfig;
  categorical?: CatConfig;
  bivariate?: BiConfig;
}
```

## Classification

| Method | Implementation | Notes |
|--------|----------------|-------|
| Equal Interval | Deterministic range slicing | Full implementation |
| Quantile | Sorted values with ties collapsed | Full implementation |
| Jenks | Falls back to quantile | Placeholder implementation |
| Standard Deviation | Mean ± n\*σ bands | Full implementation |
| Manual | User-specified breaks | Full implementation |

Classification computations run synchronously on main thread. DuckDB provides `Duck.breaks()` for efficient break calculation.

## Color Palettes

Sequential, Diverging, Qualitative, Bivariate matrix. Accessibility filter flags unsafe combos. Palette inversion toggle.

## Projections

Ranked by dataset extent & distortion heuristics. Categories: cylindrical, pseudo-cylindrical, conic, azimuthal, discontinuous. Custom WKT/PROJ.4 accepted.

## Layer Assembly

1. Bind dataset slice
2. Map attributes (fillColor/size/pattern)
3. Enable picking
4. Composite ordering: basemap → thematic → overlays (annotations, indicators)

## Collections (Facets)

Common vs independent scale modes. Grid layout (configurable columns). Optional synchronized interactions (pan/zoom linking).

## Simplification

- Catalog basemap: tiered preprocessed levels
- Imported: adjustable tolerance (warn on excessive loss)
  Preview uses simplified geometry; final settle re-renders full detail.

## Performance Levers

| Concern          | Strategy                                                               |
| ---------------- | ---------------------------------------------------------------------- |
| Rapid edits      | Throttle recompute + temporary simplified rendering                    |
| Large geometry   | LOD + partial redraw                                                   |
| Classification   | Intended caching keyed by dataset + params (basic in-memory reuse now) |
| Picking overhead | Compact binary attributes                                              |

## Legends

Choropleth (breaks), Proportional (size samples), Categorical (mapping), Bivariate (matrix). Regenerated on relevant param change.

## Edge Handling

All-null → disable suggestion; single-valued numeric → suggest categorical; too many categories → collapse into Other; projection failure → fallback default.

## Extension Points

| Area           | Contract                                 |
| -------------- | ---------------------------------------- |
| New viz type   | Factory returning config → layer builder |
| Classification | Strategy interface compute(values,k)     |
| Palette        | Provider metadata + generator            |
| Projection     | Add to catalog + ranking metadata        |

## Implementation Notes

| Area      | Current State | Future Enhancement |
| --------- | ------------- | ------------------ |
| Jenks     | Quantile fallback | Real algorithm implementation |
| Workers   | Main thread | Worker pool for large datasets |
| Caching   | Basic reuse | Hash-based invalidation |

## Quick Reference

- Default classes: 5 (range 3-9 recommended)
- Bivariate: requires two numeric variables
- Facets: common scale for comparison, independent for exploration
- Performance: simplification for >10k vertices recommended
