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
│   └── use-map-position.svelte.ts # localStorage persistence
├── interactions/         # Tooltip service
└── components/           # Svelte components (deck-map.svelte ~165 lines)
```

### Hooks Pattern

The map component uses **Svelte 5 custom hooks** to extract logic:

```typescript
// Hook returns object with getters for reactive values
export function useMapState(): UseMapStateReturn {
  const activeVisualizations = $derived(
    visualizationStore.activeVisualizations
  );

  return {
    get activeVisualizations() {
      return activeVisualizations;
    },
    buildLayerContext
  };
}

// Usage with callback props for component-local state
const mapInit = useMapInit({
  onMapLoaded: () => mapLayers.updateLayers(jsTable, userGeoJSON),
  onWorldBaseLoaded: (table) => {
    worldBaseTable = table;
  },
  onMoveEnd: () => mapPosition.savePosition()
});
```

### Available Hooks

| Hook             | Responsibility                                     |
| ---------------- | -------------------------------------------------- |
| `useMapInit`     | MapLibre/Deck.gl initialization, destroy           |
| `useMapState`    | Visualization state, memoized colors, LayerContext |
| `useMapLayers`   | Deck.gl layer updates                              |
| `useMapBasemap`  | Basemap style sync, OSM raster layers              |
| `useMapBounds`   | fitBounds for Arrow/GeoJSON data                   |
| `useMapPosition` | localStorage persistence (center/zoom)             |

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
5. Deck.gl Layer Creation (GeoJsonLayer, SolidPolygonLayer, PathLayer, ScatterplotLayer via geoarrow-deck-stream)
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

## Map Highlighting System

**Store**: `src/lib/features/map/stores/map-highlight.store.svelte.ts`

Highlight search results or filtered rows on the map with opacity dimming.

### API

```typescript
import { mapHighlightStore } from '$lib/features/map/stores/map-highlight.store.svelte';

// Highlight specific rows
mapHighlightStore.setHighlightedRows([1, 5, 12, 23]);

// Check if row is highlighted
const isHighlighted = mapHighlightStore.isRowHighlighted(5); // true

// Clear all highlights
mapHighlightStore.clearHighlights();

// Reactive state
mapHighlightStore.hasHighlights; // boolean derived
mapHighlightStore.version; // number, incremented on changes
```

### Rendering Integration

Highlighted rows: **100% opacity**
Non-highlighted rows: **30% opacity** (dimmed)

Integration point: `src/lib/features/map/layers/layer-factory.ts`

## Basemap Layers System

**Store**: `src/lib/features/map/stores/basemap-layers.store.svelte.ts` (278 lines)

Manage 9 configurable basemap layers with per-layer styling.

### Layer Types

| Layer ID     | Type            | Default Visible | Properties                                   |
| ------------ | --------------- | --------------- | -------------------------------------------- |
| `terre`      | Land polygons   | ✅              | fill color/shadow/opacity, stroke (dotted)   |
| `mers`       | Sea background  | ✅              | color, opacity                               |
| `lacs`       | Lake polygons   | ❌              | color, thickness, opacity                    |
| `rivieres`   | River lines     | ❌              | color, dotted pattern, thickness, opacity    |
| `relief`     | Terrain shading | ❌              | representation (shading/hachure), color      |
| `equateur`   | Equator line    | ❌              | color, dotted pattern, thickness, opacity    |
| `meridiens`  | Meridians       | ❌              | remarquables (ALL/GREENWICH), dotted pattern |
| `frontieres` | Borders         | ✅              | color, dotted pattern, thickness, opacity    |
| `villes`     | Cities          | ❌              | category (capitals/large), symbol, size      |

### API

```typescript
import { basemapLayersStore } from '$lib/features/map/stores/basemap-layers.store.svelte';

// Get all layers
basemapLayersStore.layers; // BasemapLayerConfig[]

// Get visible layers only
basemapLayersStore.visibleLayers; // filtered array

// Get specific layer (type-safe)
const terre = basemapLayersStore.getLayer('terre'); // TerreLayerConfig

// Toggle visibility
basemapLayersStore.setLayerVisibility('lacs', true);

// Update layer properties
basemapLayersStore.updateLayer('terre', {
  fillColor: '#f0f0f0',
  strokeDotted: true
});

// Reset single layer to defaults
basemapLayersStore.resetLayer('relief');

// Reset all layers to defaults
basemapLayersStore.resetToDefaults();

// Restore from project
basemapLayersStore.restoreFromSerialized(projectData.basemapLayers);
```

### UI Components

Located in `src/lib/features/main-toolbar/visualization-tab/components/basemap-layers/`:

- `basemap-layers-panel.svelte` - Main panel
- `terre-layer-config.svelte` - Land configuration
- `mers-layer-config.svelte` - Sea configuration
- `lacs-rivieres-layer-config.svelte` - Water bodies
- `relief-layer-config.svelte` - Terrain
- `equateur-meridiens-layer-config.svelte` - Grid lines
- `frontieres-layer-config.svelte` - Borders
- `villes-layer-config.svelte` - Cities

### Dotted Patterns

```typescript
enum BasemapDottedPattern {
  DOTS = 'dots',
  DASHES = 'dashes',
  MIXED = 'mixed'
}
```

### Rendering

Layers render in MapLibre via `src/lib/features/map/layers/basemap-layers.ts`.
Version counter triggers re-render when layer configs change.

## Color-Blindness Filters

**Utility**: `src/lib/features/commons/utils/color-blindness-filters.ts`

Apply SVG `feColorMatrix` filters to simulate 8 color-blindness types.

### Supported Types

| Type          | Description                    | Matrix Transformation |
| ------------- | ------------------------------ | --------------------- |
| Protanopia    | Red-blind (dichromacy)         | Remove red channel    |
| Deuteranopia  | Green-blind (dichromacy)       | Remove green channel  |
| Tritanopia    | Blue-blind (dichromacy)        | Remove blue channel   |
| Protanomaly   | Red-weak (anomalous trichromat | Reduce red            |
| Deuteranomaly | Green-weak                     | Reduce green          |
| Tritanomaly   | Blue-weak                      | Reduce blue           |
| Achromatopsia | Complete color-blind           | Grayscale             |
| Achromatomaly | Partial color-blind            | Reduced saturation    |

### Usage

```typescript
import { applyColorBlindnessFilter } from '$lib/features/commons/utils/color-blindness-filters';
import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';

const mapElement = document.getElementById('map-container');

// Apply filter
applyColorBlindnessFilter(mapElement, ColorBlindnessType.DEUTERANOPIA);

// Remove filter
applyColorBlindnessFilter(mapElement, ColorBlindnessType.NONE);
```

### Implementation

Creates hidden SVG element in DOM with `<filter>` + `<feColorMatrix>`.
Applies via CSS `filter: url(#khartis-color-blindness-filter)`.

Auto-cleans old filters when switching types.

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
