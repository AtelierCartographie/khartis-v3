# Visualization & Rendering

> **Thematic map configuration and GPU rendering pipeline**

## Visualization Types

| Type                     | Use Case                | Requirements                    |
| ------------------------ | ----------------------- | ------------------------------- |
| **Choropleth**           | Color-coded regions     | Geometry + numeric variable     |
| **Proportional Symbols** | Sized markers           | Geometry + numeric variable     |
| **Categorical**          | Distinct categories     | Geometry + categorical variable |
| **Bivariate**            | Two variables combined  | Geometry + 2 numeric variables  |
| **Combined**             | Multiple visualizations | Geometry + multiple variables   |

## Lifecycle

```
Dataset → Auto-Suggestion → User Configuration
  ↓
Classification + Color Selection + Projection
  ↓
Layer Assembly (Deck.gl) → GPU Rendering → Legend Generation
```

## Configuration Structure

```ts
interface VisualizationConfig {
  id: string;
  datasetId: string;
  type:
    | 'choropleth'
    | 'proportional'
    | 'categorical'
    | 'bivariate'
    | 'combined';
  classification?: Classification;
  color?: ColorConfig;
  proportional?: SymbolConfig;
  categorical?: CategoryConfig;
  bivariate?: BivariateConfig;
  combined?: CombinedConfig;
}
```

## Classification Methods

| Method             | Algorithm                          | Status      | Notes                  |
| ------------------ | ---------------------------------- | ----------- | ---------------------- |
| **Equal Interval** | `(max - min) / k` uniform ranges   | ✅ Full     | Simple, consistent     |
| **Quantile**       | Equal-count bins with tie handling | ✅ Full     | Balanced distribution  |
| **Jenks**          | Natural breaks optimization        | ⚠️ Fallback | Falls back to Quantile |
| **Std Deviation**  | `mean ± n×σ` bands                 | ✅ Full     | Statistical breaks     |
| **Manual**         | User-specified breaks              | ✅ Full     | Full control           |

**Default**: 5 classes (recommended range: 3-9)

**Performance**: Main thread computation; DuckDB `breaks()` for large datasets

### Break Calculation

```ts
// Via DuckDB for efficiency
const breaks = await Duck.breaks(tableName, column, 'quantile', 5);

// Or via classification utilities
import { classifyEqualInterval } from '$lib/features/map/utils/classification';
const breaks = classifyEqualInterval(values, 5);
```

## Color Palettes

### Palette Types

- **Sequential**: Single hue progression (light → dark)
- **Diverging**: Two hues with neutral midpoint
- **Qualitative**: Distinct colors for categories
- **Bivariate**: 2D color matrix (3×3 or 4×4)

**Accessibility**: Palette filter flags WCAG contrast issues, color-blind unsafe combos

**Features**: Palette inversion toggle, custom color picker

## Projections

**Selection Strategy**: Ranked by dataset extent fit and distortion heuristics

### Projection Categories

- **Cylindrical**: Mercator, Equirectangular
- **Pseudo-cylindrical**: Robinson, Natural Earth
- **Conic**: Albers, Lambert Conformal
- **Azimuthal**: Orthographic, Stereographic
- **Discontinuous**: Interrupted projections

**Custom Support**: WKT or PROJ.4 string accepted

### Auto-Selection

```ts
// Ranked by fit to dataset bbox
const suggestions = ProjectionSelector.rankProjections(datasetBounds);
const best = suggestions[0]; // Highest score
```

## Layer Assembly

### Map Module Architecture

The map feature uses a **modular functional design** following the same pattern as DuckDB:

```
src/lib/features/map/
├── types.ts              # Consolidated types (LayerContext, GeometryInfo, etc.)
├── constants/            # Enums (GeometryType, ArrowExtension, DeckLayerId)
├── core/bounds.ts        # calculateBoundsFromGeoArrow/GeoJSON
├── io/geometry-parser.ts # WKB, GeoJSON, GeoArrow parsing
├── layers/               # Layer factory and helpers
│   ├── layer-helpers.ts  # Color/size accessors, withOpacity
│   └── layer-factory.ts  # createDeckLayers, createWorldBaseLayer
├── hooks/                # Svelte 5 custom hooks
│   ├── use-map-init.svelte.ts     # MapLibre + Deck.gl initialization
│   ├── use-map-state.svelte.ts    # Visualization state, LayerContext
│   ├── use-map-layers.svelte.ts   # Deck.gl layer management
│   ├── use-map-basemap.svelte.ts  # Basemap style + OSM raster
│   ├── use-map-bounds.svelte.ts   # fitBounds for Arrow/GeoJSON
│   ├── use-map-position.svelte.ts # localStorage persistence
│   └── use-map-zoom.svelte.ts     # Global zoom state sync
├── interactions/         # Tooltip service
└── components/           # Svelte components (deck-map.svelte ~165 lines)
```

### Hooks Pattern

The map component uses **Svelte 5 custom hooks** to extract logic:

```typescript
// Hook returns object with getters for reactive values
export function useMapState(): UseMapStateReturn {
  const activeVisualizations = $derived(visualizationStore.activeVisualizations);

  return {
    get activeVisualizations() { return activeVisualizations; },
    buildLayerContext
  };
}

// Usage with callback props for component-local state
const mapInit = useMapInit({
  onMapLoaded: () => mapLayers.updateLayers(jsTable, userGeoJSON),
  onWorldBaseLoaded: (table) => { worldBaseTable = table; },
  onZoom: () => mapZoom.handleMapZoom(),
  onMoveEnd: () => mapPosition.savePosition()
});
```

### Available Hooks

| Hook | Responsibility |
|------|----------------|
| `useMapInit` | MapLibre/Deck.gl initialization, destroy |
| `useMapState` | Visualization state, memoized colors, LayerContext |
| `useMapLayers` | Deck.gl layer updates |
| `useMapBasemap` | Basemap style sync, OSM raster layers |
| `useMapBounds` | fitBounds for Arrow/GeoJSON data |
| `useMapPosition` | localStorage persistence (center/zoom) |
| `useMapZoom` | Global zoom state ↔ MapLibre sync |

### Layer Creation

```typescript
import { createDeckLayers, type LayerContext } from '$lib/features/map';

const ctx: LayerContext = {
  viz: visualization,
  datasetId: 'my-dataset',
  fillColor: [180, 180, 180],
  strokeColor: [255, 255, 255],
  fillOpacity: 0.6,
  strokeWidth: 1,
  strokeOpacity: 1,
  statistics: { min: 0, max: 100 },
  categoryColorMap: null
};

const layers = createDeckLayers(arrowTable, ctx);
```

### Rendering Pipeline

```
1. Dataset Slice (filtered rows)
   ↓
2. Geometry Parsing (io/geometry-parser.ts)
   ↓
3. Layer Factory (layers/layer-factory.ts)
   ↓
4. Attribute Mapping (fillColor, size via layer-helpers.ts)
   ↓
5. Deck.gl Layer Creation (GeoJsonLayer, GeoArrowScatterplotLayer, etc.)
   ↓
6. Tooltip Configuration (interactions/tooltip.service.ts)
   ↓
7. Layer Compositing (basemap → thematic → annotations)
   ↓
8. GPU Rendering (hardware-accelerated)
```

### Layer Order

```
Bottom: Basemap (MapLibre)
  ↓
Middle: World Base Layer (createWorldBaseLayer)
  ↓
Middle: Thematic Layers (createDeckLayers)
  ↓
Top: Overlays (annotations, scale, north arrow)
```

## Collections (Facets)

**Purpose**: Multi-map comparison by grouping variable

**Features:**

- **Common scale**: Same breaks/colors across all maps (comparison)
- **Independent scale**: Per-map optimization (exploration)
- **Grid layout**: Configurable columns
- **Synchronized interactions**: Optional pan/zoom linking

**Example**: Compare sales by region across years

## Geometry Simplification

### Strategy

| Source                | Approach                                   |
| --------------------- | ------------------------------------------ |
| **Catalog basemaps**  | Pre-simplified tiers (multiple LOD levels) |
| **Imported geometry** | Adjustable tolerance with preview          |

**Performance**: Simplify geometries >10k vertices

**Workflow**:

1. Preview uses simplified geometry (fast interaction)
2. Final render uses full detail (or user-selected tolerance)
3. Warning if excessive geometry loss

### Simplification Tolerance

```ts
// Adjust tolerance (0 = no simplification, 1 = max)
const simplified = simplifyGeometry(geometry, tolerance);
```

## Performance Optimization

| Challenge            | Solution                                         |
| -------------------- | ------------------------------------------------ |
| **Rapid edits**      | Throttle recompute + temporary simplified render |
| **Large geometry**   | LOD + partial redraw                             |
| **Classification**   | In-memory cache keyed by dataset + params        |
| **Picking overhead** | Compact binary attributes                        |

**Targets**: 60fps pan/zoom, <1s classification recompute

## Legend Generation

### Legend Types

| Visualization    | Legend Style                     |
| ---------------- | -------------------------------- |
| **Choropleth**   | Color ramp with break values     |
| **Proportional** | Size samples (min, mid, max)     |
| **Categorical**  | Category → color mapping         |
| **Bivariate**    | 2D color matrix with axes labels |

**Auto-regeneration**: On classification, color, or data change

## Edge Case Handling

| Issue                   | Handling                               |
| ----------------------- | -------------------------------------- |
| **All-null values**     | Disable visualization suggestion       |
| **Single value**        | Suggest categorical instead of numeric |
| **Too many categories** | Collapse low-frequency into "Other"    |
| **Projection failure**  | Fallback to Equirectangular (default)  |
| **Invalid breaks**      | Revert to Equal Interval with warning  |

## Extension Points

### Add New Visualization Type

```ts
// 1. Define config interface
interface MyVizConfig extends BaseVizConfig {
  myParam: string;
}

// 2. Create factory
export function createMyViz(
  dataset: Dataset,
  config: MyVizConfig
): Visualization {
  // Implementation
}

// 3. Register in visualization registry
VizRegistry.register('my-viz', {
  create: createMyViz,
  validate: validateMyViz
});
```

### Add New Classification Method

```ts
// 1. Implement strategy
export function classifyMyMethod(values: number[], k: number): number[] {
  // Calculate breaks
  return breaks;
}

// 2. Register method
ClassificationRegistry.register('my-method', {
  id: 'my-method',
  label: 'My Method',
  compute: classifyMyMethod
});
```

### Add Custom Palette

```ts
// 1. Define palette
const myPalette: ColorPalette = {
  id: 'my-palette',
  name: 'My Palette',
  type: 'sequential',
  colors: ['#fff', '#f00'],
  accessible: true
};

// 2. Register
PaletteRegistry.register(myPalette);
```

## Implementation Status

| Feature              | Status     | Notes                      |
| -------------------- | ---------- | -------------------------- |
| **Choropleth**       | ✅ Full    | Complete implementation    |
| **Proportional**     | ✅ Full    | Symbol sizing working      |
| **Categorical**      | ✅ Full    | Category mapping complete  |
| **Bivariate**        | ✅ Full    | 2D classification working  |
| **Facets**           | ✅ Full    | Multi-map comparison ready |
| **Jenks**            | ⚠️ Partial | Fallback to Quantile       |
| **Worker offload**   | ❌ Planned | Main thread currently      |
| **Advanced caching** | ❌ Planned | Basic reuse only           |

## Quick Reference

### Default Settings

- **Classes**: 5 (range 3-9 recommended)
- **Projection**: Auto-selected by dataset bounds
- **Color**: Sequential for numeric, qualitative for categorical
- **Simplification**: Enabled for >10k vertices

### Performance Tips

- Use simplification for complex geometry
- Limit classes to 5-7 for readability
- Enable DuckDB for large datasets (>5k rows)
- Use collections sparingly (memory intensive)

---

**See also:**

- [DATA_PIPELINE.md](DATA_PIPELINE.md) - Data preparation
- [ARCHITECTURE.md](ARCHITECTURE.md) - GPU rendering architecture
- [STATE_AND_FEATURES.md](STATE_AND_FEATURES.md) - Visualization store
