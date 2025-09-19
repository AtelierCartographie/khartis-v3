# Deck.gl and MapLibre Integration

## Overview

Deck.gl provides GPU-accelerated WebGL rendering for large-scale data visualization, while MapLibre GL serves as the base map rendering engine. Together, they power Khartis v3's interactive cartographic visualizations.

## Architecture

### Core Components

```typescript
// Map rendering engine
src/lib/features/map/map.svelte
src/lib/features/map/map.store.svelte.ts
src/lib/features/map/layers/

// Deck.gl layers
src/lib/features/map/layers/choropleth-layer.ts
src/lib/features/map/layers/symbol-layer.ts
src/lib/features/map/layers/heatmap-layer.ts

// MapLibre integration
src/lib/features/map/basemap/maplibre-provider.ts
src/lib/features/map/basemap/styles/
```

## Deck.gl Setup

### Initialization

```typescript
import { Deck } from '@deck.gl/core';
import { GeoJsonLayer, PathLayer, IconLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';

class MapRenderer {
  private deck: Deck;
  private map: maplibregl.Map;

  initialize(container: HTMLDivElement): void {
    // Initialize MapLibre base map
    this.map = new maplibregl.Map({
      container,
      style: this.getBaseMapStyle(),
      center: [2.3522, 48.8566],
      zoom: 5,
      interactive: false
    });

    // Initialize Deck.gl overlay
    this.deck = new Deck({
      canvas: 'deck-canvas',
      width: '100%',
      height: '100%',
      initialViewState: {
        longitude: 2.3522,
        latitude: 48.8566,
        zoom: 5,
        pitch: 0,
        bearing: 0
      },
      controller: true,
      onViewStateChange: ({ viewState }) => {
        this.map.jumpTo({
          center: [viewState.longitude, viewState.latitude],
          zoom: viewState.zoom,
          bearing: viewState.bearing,
          pitch: viewState.pitch
        });
      },
      layers: []
    });
  }
}
```

## Layer System

### Choropleth Layer

```typescript
import { GeoJsonLayer } from '@deck.gl/layers';
import { scaleQuantile, scaleSequential } from 'd3-scale';
import { interpolateViridis } from 'd3-scale-chromatic';

export function createChoroplethLayer(
  data: GeoJSON.FeatureCollection,
  config: ChoroplethConfig
): GeoJsonLayer {
  const { variable, colorScheme, breaks, opacity } = config;

  // Create color scale
  const values = data.features.map(f => f.properties[variable]);
  const colorScale = breaks
    ? scaleQuantile().domain(values).range(colorScheme)
    : scaleSequential(interpolateViridis).domain([Math.min(...values), Math.max(...values)]);

  return new GeoJsonLayer({
    id: 'choropleth',
    data,
    filled: true,
    stroked: true,
    pickable: true,

    getFillColor: (d: any) => {
      const value = d.properties[variable];
      const color = colorScale(value);
      return hexToRgb(color, opacity);
    },

    getLineColor: [255, 255, 255, 100],
    getLineWidth: 1,
    lineWidthMinPixels: 0.5,

    updateTriggers: {
      getFillColor: [variable, colorScheme, breaks, opacity]
    },

    onHover: ({ object }) => {
      if (object) {
        showTooltip(object.properties);
      }
    }
  });
}
```

### Proportional Symbols Layer

```typescript
import { ScatterplotLayer } from '@deck.gl/layers';
import { scaleSqrt } from 'd3-scale';

export function createProportionalSymbolLayer(
  data: any[],
  config: SymbolConfig
): ScatterplotLayer {
  const { variable, minSize, maxSize, color, opacity } = config;

  // Create size scale
  const values = data.map(d => d.properties[variable]);
  const sizeScale = scaleSqrt()
    .domain([Math.min(...values), Math.max(...values)])
    .range([minSize, maxSize]);

  return new ScatterplotLayer({
    id: 'proportional-symbols',
    data,
    pickable: true,
    opacity,
    stroked: true,
    filled: true,
    radiusScale: 1,
    radiusMinPixels: minSize,
    radiusMaxPixels: maxSize * 10,
    lineWidthMinPixels: 1,

    getPosition: d => d.geometry.coordinates,
    getRadius: d => sizeScale(d.properties[variable]),
    getFillColor: hexToRgb(color, opacity * 255),
    getLineColor: [255, 255, 255],

    updateTriggers: {
      getRadius: [variable, minSize, maxSize]
    }
  });
}
```

### Categorical Layer

```typescript
import { IconLayer } from '@deck.gl/layers';

export function createCategoricalLayer(
  data: any[],
  config: CategoricalConfig
): IconLayer {
  const { variable, categories, iconMapping, size } = config;

  return new IconLayer({
    id: 'categorical',
    data,
    pickable: true,
    iconAtlas: '/icons/sprite.png',
    iconMapping,
    sizeScale: size,

    getPosition: d => d.geometry.coordinates,
    getIcon: d => {
      const category = d.properties[variable];
      return categories[category]?.icon || 'default';
    },
    getSize: size,
    getColor: d => {
      const category = d.properties[variable];
      return hexToRgb(categories[category]?.color || '#808080');
    }
  });
}
```

### Heatmap Layer

```typescript
import { HeatmapLayer } from '@deck.gl/aggregation-layers';

export function createHeatmapLayer(
  data: any[],
  config: HeatmapConfig
): HeatmapLayer {
  const { intensity, radius, colorRange } = config;

  return new HeatmapLayer({
    id: 'heatmap',
    data,
    getPosition: d => d.geometry.coordinates,
    getWeight: d => d.properties[config.variable] || 1,
    radiusPixels: radius,
    intensity,
    threshold: 0.05,
    colorRange
  });
}
```

## MapLibre Integration

### Base Map Styles

```typescript
interface BaseMapStyle {
  id: string;
  name: string;
  url?: string;
  style?: any;
}

const BASE_MAP_STYLES: BaseMapStyle[] = [
  {
    id: 'osm-bright',
    name: 'OpenStreetMap Bright',
    url: 'https://api.maptiler.com/maps/bright/style.json?key=YOUR_KEY'
  },
  {
    id: 'carto-light',
    name: 'Carto Light',
    style: {
      version: 8,
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
          tileSize: 256
        }
      },
      layers: [{
        id: 'carto-light',
        type: 'raster',
        source: 'carto-light'
      }]
    }
  },
  {
    id: 'satellite',
    name: 'Satellite',
    url: 'https://api.maptiler.com/maps/satellite/style.json?key=YOUR_KEY'
  }
];
```

### Custom Map Styles

```typescript
export function createCustomStyle(config: StyleConfig): any {
  const { background, water, land, roads, labels } = config;

  return {
    version: 8,
    sources: {
      'natural-earth': {
        type: 'vector',
        url: 'mapbox://mapbox.natural-earth-v2'
      }
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': background
        }
      },
      {
        id: 'water',
        type: 'fill',
        source: 'natural-earth',
        'source-layer': 'water',
        paint: {
          'fill-color': water,
          'fill-opacity': 0.8
        }
      },
      {
        id: 'land',
        type: 'fill',
        source: 'natural-earth',
        'source-layer': 'land',
        paint: {
          'fill-color': land
        }
      },
      roads && {
        id: 'roads',
        type: 'line',
        source: 'natural-earth',
        'source-layer': 'roads',
        paint: {
          'line-color': roads,
          'line-width': 1
        }
      },
      labels && {
        id: 'labels',
        type: 'symbol',
        source: 'natural-earth',
        'source-layer': 'place_labels',
        layout: {
          'text-field': '{name}',
          'text-size': 12
        },
        paint: {
          'text-color': labels
        }
      }
    ].filter(Boolean)
  };
}
```

## View Synchronization

### Camera Management

```typescript
class CameraController {
  private deck: Deck;
  private map: maplibregl.Map;
  private projection: d3.GeoProjection;

  syncViews(): void {
    // Sync Deck.gl view with MapLibre
    this.deck.setProps({
      onViewStateChange: ({ viewState }) => {
        this.map.jumpTo({
          center: [viewState.longitude, viewState.latitude],
          zoom: viewState.zoom,
          bearing: viewState.bearing,
          pitch: viewState.pitch
        });

        // Update projection if needed
        if (this.projection) {
          this.updateProjectionBounds(viewState);
        }
      }
    });

    // Sync MapLibre view with Deck.gl
    this.map.on('move', () => {
      const { lng, lat } = this.map.getCenter();
      const zoom = this.map.getZoom();
      const bearing = this.map.getBearing();
      const pitch = this.map.getPitch();

      this.deck.setProps({
        viewState: {
          longitude: lng,
          latitude: lat,
          zoom,
          bearing,
          pitch
        }
      });
    });
  }

  fitBounds(bounds: [[number, number], [number, number]]): void {
    const [minLng, minLat] = bounds[0];
    const [maxLng, maxLat] = bounds[1];

    this.map.fitBounds(bounds, {
      padding: 50,
      duration: 1000
    });

    // Calculate appropriate zoom
    const viewport = this.deck.getViewports()[0];
    const { zoom } = viewport.fitBounds(bounds);

    this.deck.setProps({
      initialViewState: {
        longitude: (minLng + maxLng) / 2,
        latitude: (minLat + maxLat) / 2,
        zoom,
        transitionDuration: 1000
      }
    });
  }
}
```

## Interactions

### Tooltip System

```typescript
class TooltipManager {
  private tooltip: HTMLDivElement;
  private deck: Deck;

  initialize(): void {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'map-tooltip';
    document.body.appendChild(this.tooltip);

    this.deck.setProps({
      onHover: (info, event) => {
        if (info.object) {
          this.showTooltip(info, event);
        } else {
          this.hideTooltip();
        }
      }
    });
  }

  showTooltip(info: any, event: MouseEvent): void {
    const { object, x, y } = info;
    const properties = object.properties || object;

    // Build tooltip content
    const content = this.buildTooltipContent(properties);

    this.tooltip.innerHTML = content;
    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${y + 10}px`;
    this.tooltip.style.display = 'block';
  }

  buildTooltipContent(properties: any): string {
    return Object.entries(properties)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => `
        <div class="tooltip-row">
          <span class="tooltip-key">${key}:</span>
          <span class="tooltip-value">${this.formatValue(value)}</span>
        </div>
      `)
      .join('');
  }

  formatValue(value: any): string {
    if (typeof value === 'number') {
      return value.toLocaleString('fr-FR');
    }
    return String(value);
  }

  hideTooltip(): void {
    this.tooltip.style.display = 'none';
  }
}
```

### Selection Management

```typescript
class SelectionManager {
  private selectedFeatures = new Set<string>();
  private deck: Deck;

  initialize(): void {
    this.deck.setProps({
      onClick: (info) => {
        if (info.object) {
          this.toggleSelection(info.object);
        } else {
          this.clearSelection();
        }
      }
    });
  }

  toggleSelection(feature: any): void {
    const id = feature.properties?.id || feature.id;

    if (this.selectedFeatures.has(id)) {
      this.selectedFeatures.delete(id);
    } else {
      this.selectedFeatures.add(id);
    }

    this.updateLayerSelection();
  }

  updateLayerSelection(): void {
    const layers = this.deck.props.layers.map(layer => {
      if (layer.id === 'choropleth') {
        return layer.clone({
          getLineWidth: (d: any) => {
            const id = d.properties?.id || d.id;
            return this.selectedFeatures.has(id) ? 3 : 1;
          },
          getLineColor: (d: any) => {
            const id = d.properties?.id || d.id;
            return this.selectedFeatures.has(id)
              ? [255, 0, 0, 255]
              : [255, 255, 255, 100];
          }
        });
      }
      return layer;
    });

    this.deck.setProps({ layers });
  }

  clearSelection(): void {
    this.selectedFeatures.clear();
    this.updateLayerSelection();
  }

  getSelectedFeatures(): string[] {
    return Array.from(this.selectedFeatures);
  }
}
```

## Performance Optimization

### Layer Optimization

```typescript
interface OptimizationOptions {
  simplifyGeometry?: boolean;
  clusterPoints?: boolean;
  tileLoading?: boolean;
  levelOfDetail?: boolean;
}

export function optimizeLayer(
  layer: any,
  options: OptimizationOptions
): any {
  const optimized = { ...layer };

  if (options.simplifyGeometry && layer.type === 'GeoJsonLayer') {
    optimized.data = simplifyGeometry(layer.data, 0.001);
  }

  if (options.clusterPoints && layer.type === 'ScatterplotLayer') {
    return createClusteredLayer(layer);
  }

  if (options.tileLoading) {
    optimized.data = createTileSource(layer.data);
    optimized.TileLayer = true;
  }

  if (options.levelOfDetail) {
    optimized.getLineWidth = createLODFunction(layer.getLineWidth);
    optimized.minZoom = 3;
    optimized.maxZoom = 18;
  }

  return optimized;
}
```

### Viewport Culling

```typescript
class ViewportCuller {
  private viewport: any;
  private buffer: number = 1.2; // 20% buffer

  cull(features: any[]): any[] {
    if (!this.viewport) return features;

    const bounds = this.viewport.getBounds();
    const [minLng, minLat, maxLng, maxLat] = this.expandBounds(bounds);

    return features.filter(feature => {
      const coords = this.getCoordinates(feature);
      if (!coords) return false;

      const [lng, lat] = coords;
      return lng >= minLng && lng <= maxLng &&
             lat >= minLat && lat <= maxLat;
    });
  }

  expandBounds(bounds: number[]): number[] {
    const [minLng, minLat, maxLng, maxLat] = bounds;
    const lngDiff = (maxLng - minLng) * (this.buffer - 1) / 2;
    const latDiff = (maxLat - minLat) * (this.buffer - 1) / 2;

    return [
      minLng - lngDiff,
      minLat - latDiff,
      maxLng + lngDiff,
      maxLat + latDiff
    ];
  }

  getCoordinates(feature: any): [number, number] | null {
    if (feature.geometry?.type === 'Point') {
      return feature.geometry.coordinates;
    }
    if (feature.geometry?.type === 'Polygon') {
      return this.getPolygonCenter(feature.geometry.coordinates[0]);
    }
    return null;
  }

  getPolygonCenter(coordinates: number[][]): [number, number] {
    const lng = coordinates.reduce((sum, coord) => sum + coord[0], 0) / coordinates.length;
    const lat = coordinates.reduce((sum, coord) => sum + coord[1], 0) / coordinates.length;
    return [lng, lat];
  }
}
```

### WebGL Context Management

```typescript
class WebGLManager {
  private maxTextures: number;
  private textureCache: Map<string, WebGLTexture>;

  initialize(gl: WebGLRenderingContext): void {
    this.maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    this.textureCache = new Map();

    // Enable optimizations
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  optimizeForLargeDatasets(): void {
    // Use instancing for repeated geometries
    const instancedArrays = this.gl.getExtension('ANGLE_instanced_arrays');

    // Enable vertex array objects
    const vao = this.gl.getExtension('OES_vertex_array_object');

    // Use element index uint for large meshes
    const uint = this.gl.getExtension('OES_element_index_uint');
  }

  manageMemory(): void {
    // Clear unused textures
    this.textureCache.forEach((texture, key) => {
      if (!this.isTextureInUse(key)) {
        this.gl.deleteTexture(texture);
        this.textureCache.delete(key);
      }
    });

    // Force garbage collection
    if (this.textureCache.size > this.maxTextures * 0.8) {
      this.clearLeastRecentlyUsed();
    }
  }
}
```

## Testing

### Unit Tests

```typescript
describe('Deck.gl Layers', () => {
  test('creates choropleth layer', () => {
    const data = createMockGeoJSON();
    const layer = createChoroplethLayer(data, {
      variable: 'population',
      colorScheme: ['#fff', '#f00'],
      breaks: [0, 100, 1000],
      opacity: 0.8
    });

    expect(layer.id).toBe('choropleth');
    expect(layer.props.filled).toBe(true);
    expect(layer.props.opacity).toBe(0.8);
  });

  test('handles click events', () => {
    const onClick = jest.fn();
    const layer = new GeoJsonLayer({
      id: 'test',
      data: createMockGeoJSON(),
      pickable: true,
      onClick
    });

    layer.props.onClick({ object: { id: 1 } });
    expect(onClick).toHaveBeenCalledWith({ object: { id: 1 } });
  });
});
```

### Performance Tests

```typescript
describe('Rendering Performance', () => {
  test('renders 10k features at 60fps', async () => {
    const features = generateLargeDataset(10000);
    const startTime = performance.now();

    const layer = createChoroplethLayer({
      type: 'FeatureCollection',
      features
    }, {
      variable: 'value',
      colorScheme: ['#fff', '#00f'],
      opacity: 0.7
    });

    const deck = new Deck({
      layers: [layer],
      initialViewState: {
        longitude: 0,
        latitude: 0,
        zoom: 5
      }
    });

    // Wait for render
    await new Promise(resolve => setTimeout(resolve, 100));

    const renderTime = performance.now() - startTime;
    expect(renderTime).toBeLessThan(16.67); // 60fps = 16.67ms per frame
  });
});
```

## Configuration

### Deck.gl Settings

```typescript
const DECK_CONFIG = {
  // GPU settings
  gpuAggregation: true,
  fp64: false, // Use 32-bit for performance

  // Rendering settings
  useDevicePixels: true,
  pickingRadius: 3,

  // Performance settings
  _animate: true,
  _skipNavigation: false,

  // Debug settings
  debug: process.env.NODE_ENV === 'development',

  // WebGL parameters
  parameters: {
    depthTest: true,
    depthFunc: GL.LEQUAL,
    blend: true,
    blendFunc: [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],
    polygonOffsetFill: true
  }
};
```

### MapLibre Settings

```typescript
const MAPLIBRE_CONFIG = {
  // Performance
  maxTileCacheSize: 100,
  crossSourceCollisions: false,
  fadeDuration: 300,

  // Interaction
  interactive: true,
  trackResize: true,
  refreshExpiredTiles: true,

  // Rendering
  antialias: true,
  preserveDrawingBuffer: false,
  failIfMajorPerformanceCaveat: false,

  // Localization
  locale: {
    'NavigationControl.ZoomIn': 'Zoomer',
    'NavigationControl.ZoomOut': 'Dézoomer'
  }
};
```

## Troubleshooting

### Common Issues

1. **WebGL Context Lost**
   - Monitor context loss: `canvas.addEventListener('webglcontextlost', ...)`
   - Restore context: `canvas.addEventListener('webglcontextrestored', ...)`
   - Recreate layers after restoration

2. **Memory Leaks**
   - Properly dispose layers: `layer.finalize()`
   - Clear map on unmount: `map.remove()`
   - Remove event listeners

3. **Performance Issues**
   - Enable GPU aggregation for large datasets
   - Use tile-based loading for massive datasets
   - Implement viewport culling
   - Simplify geometries at lower zoom levels

4. **Projection Misalignment**
   - Ensure consistent CRS between layers
   - Transform coordinates if needed
   - Use `deck.gl-mapbox` for better integration

## Best Practices

1. **Layer Management**
   - Group related layers
   - Use unique, descriptive IDs
   - Implement proper update triggers
   - Cache computed values

2. **Data Optimization**
   - Pre-process large geometries
   - Use binary formats when possible
   - Implement progressive loading
   - Apply appropriate simplification

3. **Interaction Design**
   - Provide visual feedback for interactions
   - Implement smooth transitions
   - Handle edge cases gracefully
   - Test on various devices

4. **Memory Management**
   - Dispose unused layers
   - Clear caches periodically
   - Monitor GPU memory usage
   - Implement cleanup on unmount

## Future Enhancements

1. **3D Visualizations** - Extrusion layers for 3D thematic maps
2. **Animated Transitions** - Smooth data updates and morphing
3. **WebGPU Support** - Next-generation GPU API integration
4. **Vector Tiles** - MVT support for massive datasets
5. **Custom Shaders** - User-defined visual effects
6. **AR/VR Support** - Immersive map experiences