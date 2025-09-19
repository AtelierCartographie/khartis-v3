# Visualization System

## Overview

The visualization system transforms processed datasets into interactive cartographic representations using various thematic mapping techniques. It provides automatic suggestions, customizable parameters, and real-time rendering through Deck.gl.

## Architecture

### Core Components

```typescript
// Visualization store and state
src/lib/features/commons/store/visualization.store.svelte.ts
src/lib/features/main-toolbar/visualization-tab/

// Visualization types
src/lib/features/map/layers/choropleth-layer.ts
src/lib/features/map/layers/proportional-symbols-layer.ts
src/lib/features/map/layers/categorical-layer.ts
src/lib/features/map/layers/bivariate-layer.ts

// Configuration components
src/lib/features/main-toolbar/visualization-tab/choose-visualization.svelte
src/lib/features/main-toolbar/visualization-tab/configure-visualization.svelte
src/lib/features/main-toolbar/visualization-tab/customize-basemap.svelte
```

## Visualization Types

### 1. Choropleth Maps

Colored areas based on data classification:

```typescript
interface ChoroplethConfig {
  variable: string;
  classification: ClassificationMethod;
  classes: number;
  colorScheme: ColorScheme;
  opacity: number;
  strokeWidth: number;
  strokeColor: string;
}

export function createChoroplethVisualization(
  dataset: ProcessedDataset,
  config: ChoroplethConfig
): VisualizationLayer {
  // Calculate breaks based on classification method
  const breaks = calculateClassBreaks(
    dataset.data,
    config.variable,
    config.classification,
    config.classes
  );

  // Generate color palette
  const colors = generateColorPalette(
    config.colorScheme,
    config.classes,
    breaks
  );

  return {
    type: 'choropleth',
    id: generateLayerId('choropleth'),
    dataset,
    config,
    breaks,
    colors,
    legend: generateChoroplethLegend(breaks, colors, config)
  };
}
```

### 2. Proportional Symbols

Sized symbols for quantitative data:

```typescript
interface ProportionalSymbolConfig {
  variable: string;
  symbolType: 'circle' | 'square' | 'triangle';
  minSize: number;
  maxSize: number;
  color: string;
  opacity: number;
  strokeWidth: number;
  strokeColor: string;
  scalingMethod: 'linear' | 'sqrt' | 'log';
}

export function createProportionalSymbols(
  dataset: ProcessedDataset,
  config: ProportionalSymbolConfig
): VisualizationLayer {
  const values = dataset.data.map(d => d[config.variable]);
  const [min, max] = d3.extent(values);

  // Create size scale based on scaling method
  const sizeScale = createSizeScale(
    [min, max],
    [config.minSize, config.maxSize],
    config.scalingMethod
  );

  return {
    type: 'proportional',
    id: generateLayerId('proportional'),
    dataset,
    config,
    sizeScale,
    legend: generateProportionalLegend(sizeScale, config)
  };
}
```

### 3. Categorical Maps

Distinct symbols/colors for categories:

```typescript
interface CategoricalConfig {
  variable: string;
  categories: Map<string, CategoryStyle>;
  defaultStyle: CategoryStyle;
  showOther: boolean;
}

interface CategoryStyle {
  color?: string;
  pattern?: PatternType;
  icon?: string;
  size?: number;
}

export function createCategoricalVisualization(
  dataset: ProcessedDataset,
  config: CategoricalConfig
): VisualizationLayer {
  // Extract unique categories
  const uniqueValues = new Set(
    dataset.data.map(d => d[config.variable])
  );

  // Assign styles to categories
  const categoryMap = new Map<string, CategoryStyle>();
  const palette = getQualitativePalette(uniqueValues.size);

  let colorIndex = 0;
  uniqueValues.forEach(value => {
    if (config.categories.has(value)) {
      categoryMap.set(value, config.categories.get(value));
    } else {
      categoryMap.set(value, {
        color: palette[colorIndex++ % palette.length],
        ...config.defaultStyle
      });
    }
  });

  return {
    type: 'categorical',
    id: generateLayerId('categorical'),
    dataset,
    config,
    categoryMap,
    legend: generateCategoricalLegend(categoryMap)
  };
}
```

### 4. Bivariate Maps

Two-variable color matrix:

```typescript
interface BivariateConfig {
  variableX: string;
  variableY: string;
  classesX: number;
  classesY: number;
  colorMatrix: string[][];
  opacity: number;
}

export function createBivariateVisualization(
  dataset: ProcessedDataset,
  config: BivariateConfig
): VisualizationLayer {
  // Calculate breaks for both variables
  const breaksX = calculateClassBreaks(
    dataset.data,
    config.variableX,
    'quantile',
    config.classesX
  );

  const breaksY = calculateClassBreaks(
    dataset.data,
    config.variableY,
    'quantile',
    config.classesY
  );

  // Create color matrix lookup
  const getColor = (valueX: number, valueY: number): string => {
    const classX = getClass(valueX, breaksX);
    const classY = getClass(valueY, breaksY);
    return config.colorMatrix[classY][classX];
  };

  return {
    type: 'bivariate',
    id: generateLayerId('bivariate'),
    dataset,
    config,
    breaksX,
    breaksY,
    getColor,
    legend: generateBivariateLegend(config)
  };
}
```

## Classification Methods

### Statistical Classification

```typescript
enum ClassificationMethod {
  EqualInterval = 'equal_interval',
  Quantile = 'quantile',
  NaturalBreaks = 'natural_breaks',
  StandardDeviation = 'standard_deviation',
  GeometricProgression = 'geometric',
  Arithmetic = 'arithmetic',
  Manual = 'manual'
}

export async function calculateClassBreaks(
  data: any[],
  variable: string,
  method: ClassificationMethod,
  numClasses: number
): Promise<number[]> {
  const values = data
    .map(d => d[variable])
    .filter(v => v != null && !isNaN(v))
    .sort((a, b) => a - b);

  switch (method) {
    case ClassificationMethod.EqualInterval:
      return equalIntervalBreaks(values, numClasses);

    case ClassificationMethod.Quantile:
      return quantileBreaks(values, numClasses);

    case ClassificationMethod.NaturalBreaks:
      return await jenksBreaks(values, numClasses);

    case ClassificationMethod.StandardDeviation:
      return standardDeviationBreaks(values, numClasses);

    case ClassificationMethod.GeometricProgression:
      return geometricBreaks(values, numClasses);

    default:
      return equalIntervalBreaks(values, numClasses);
  }
}
```

### Jenks Natural Breaks

```typescript
async function jenksBreaks(
  values: number[],
  numClasses: number
): Promise<number[]> {
  // Use DuckDB for efficient computation
  const result = await duckdb.query(`
    WITH data AS (
      SELECT unnest($1::DOUBLE[]) as value
    ),
    jenks AS (
      SELECT
        jenks_natural_breaks(value, $2) as breaks
      FROM data
    )
    SELECT unnest(breaks) as break_value
    FROM jenks
    ORDER BY break_value
  `, [values, numClasses]);

  return result.toArray().map(r => r.break_value);
}
```

## Color Systems

### Color Palettes

```typescript
interface ColorScheme {
  type: 'sequential' | 'diverging' | 'qualitative';
  name: string;
  colors: string[];
  colorBlindSafe: boolean;
}

const COLOR_SCHEMES: Map<string, ColorScheme> = new Map([
  ['viridis', {
    type: 'sequential',
    name: 'Viridis',
    colors: ['#440154', '#31688e', '#35b779', '#fde725'],
    colorBlindSafe: true
  }],
  ['rdbu', {
    type: 'diverging',
    name: 'Red-Blue',
    colors: ['#d7191c', '#fdae61', '#ffffbf', '#abd9e9', '#2c7bb6'],
    colorBlindSafe: true
  }],
  ['set3', {
    type: 'qualitative',
    name: 'Set3',
    colors: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3'],
    colorBlindSafe: false
  }]
]);

export function generateColorPalette(
  scheme: string | ColorScheme,
  numClasses: number,
  diverging: boolean = false
): string[] {
  const colorScheme = typeof scheme === 'string'
    ? COLOR_SCHEMES.get(scheme)
    : scheme;

  if (!colorScheme) {
    throw new Error(`Unknown color scheme: ${scheme}`);
  }

  if (diverging && colorScheme.type !== 'diverging') {
    // Convert sequential to diverging
    return createDivergingPalette(colorScheme.colors, numClasses);
  }

  return interpolateColors(colorScheme.colors, numClasses);
}
```

### Color Interpolation

```typescript
function interpolateColors(
  colors: string[],
  numClasses: number
): string[] {
  if (numClasses <= colors.length) {
    return colors.slice(0, numClasses);
  }

  const scale = d3.scaleLinear()
    .domain(colors.map((_, i) => i / (colors.length - 1)))
    .range(colors)
    .interpolate(d3.interpolateRgb);

  return Array.from({ length: numClasses }, (_, i) =>
    scale(i / (numClasses - 1))
  );
}
```

### Pattern Generation

```typescript
interface Pattern {
  type: 'lines' | 'dots' | 'crosses' | 'hatching';
  angle: number;
  spacing: number;
  strokeWidth: number;
  color: string;
}

export function generatePattern(
  pattern: Pattern,
  id: string
): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  svg.setAttribute('id', id);
  svg.setAttribute('patternUnits', 'userSpaceOnUse');
  svg.setAttribute('width', String(pattern.spacing * 2));
  svg.setAttribute('height', String(pattern.spacing * 2));

  if (pattern.angle !== 0) {
    svg.setAttribute(
      'patternTransform',
      `rotate(${pattern.angle})`
    );
  }

  switch (pattern.type) {
    case 'lines':
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', '0');
      line.setAttribute('x2', String(pattern.spacing * 2));
      line.setAttribute('y2', '0');
      line.setAttribute('stroke', pattern.color);
      line.setAttribute('stroke-width', String(pattern.strokeWidth));
      svg.appendChild(line);
      break;

    case 'dots':
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(pattern.spacing));
      circle.setAttribute('cy', String(pattern.spacing));
      circle.setAttribute('r', String(pattern.strokeWidth));
      circle.setAttribute('fill', pattern.color);
      svg.appendChild(circle);
      break;

    // Additional pattern types...
  }

  return svg.outerHTML;
}
```

## Visualization Suggestions

### Suggestion Algorithm

```typescript
interface VisualizationSuggestion {
  type: VisualizationType;
  score: number;
  config: any;
  reason: string;
}

export function suggestVisualizations(
  dataset: ProcessedDataset
): VisualizationSuggestion[] {
  const suggestions: VisualizationSuggestion[] = [];

  // Analyze dataset characteristics
  const hasGeometry = !!dataset.geometry;
  const numericColumns = dataset.columns.filter(c => c.type === 'numeric');
  const categoricalColumns = dataset.columns.filter(c => c.type === 'text');

  // Choropleth suggestion
  if (hasGeometry && numericColumns.length > 0) {
    numericColumns.forEach(col => {
      const score = calculateChoroplethScore(col, dataset);
      suggestions.push({
        type: 'choropleth',
        score,
        config: {
          variable: col.name,
          classification: suggestClassification(col),
          classes: suggestNumClasses(col),
          colorScheme: suggestColorScheme(col)
        },
        reason: `Variable "${col.name}" has good distribution for choropleth`
      });
    });
  }

  // Proportional symbols suggestion
  if (hasGeometry && numericColumns.length > 0) {
    numericColumns
      .filter(col => col.stats?.min >= 0) // Positive values only
      .forEach(col => {
        const score = calculateProportionalScore(col, dataset);
        suggestions.push({
          type: 'proportional',
          score,
          config: {
            variable: col.name,
            symbolType: 'circle',
            scalingMethod: suggestScalingMethod(col)
          },
          reason: `Variable "${col.name}" represents quantities`
        });
      });
  }

  // Categorical suggestion
  if (hasGeometry && categoricalColumns.length > 0) {
    categoricalColumns
      .filter(col => col.stats?.uniqueCount <= 12) // Limit categories
      .forEach(col => {
        const score = calculateCategoricalScore(col, dataset);
        suggestions.push({
          type: 'categorical',
          score,
          config: {
            variable: col.name,
            categories: suggestCategoryStyles(col)
          },
          reason: `Variable "${col.name}" has ${col.stats?.uniqueCount} categories`
        });
      });
  }

  // Bivariate suggestion
  if (hasGeometry && numericColumns.length >= 2) {
    const pairs = getCombinations(numericColumns, 2);
    pairs.forEach(([col1, col2]) => {
      const correlation = calculateCorrelation(
        dataset.data.map(d => d[col1.name]),
        dataset.data.map(d => d[col2.name])
      );

      if (Math.abs(correlation) < 0.8) { // Avoid highly correlated
        suggestions.push({
          type: 'bivariate',
          score: 0.7,
          config: {
            variableX: col1.name,
            variableY: col2.name,
            classesX: 3,
            classesY: 3
          },
          reason: `Compare "${col1.name}" and "${col2.name}"`
        });
      }
    });
  }

  // Sort by score
  return suggestions.sort((a, b) => b.score - a.score);
}
```

### Scoring Functions

```typescript
function calculateChoroplethScore(
  column: DataColumn,
  dataset: ProcessedDataset
): number {
  let score = 0.5; // Base score

  // Favor ratio/interval data
  if (column.stats?.min !== undefined && column.stats?.max !== undefined) {
    const range = column.stats.max - column.stats.min;
    if (range > 0) score += 0.2;
  }

  // Favor good distribution
  if (column.stats?.stdDev && column.stats?.mean) {
    const cv = column.stats.stdDev / column.stats.mean;
    if (cv > 0.1 && cv < 3) score += 0.2;
  }

  // Penalize too many nulls
  if (column.nullable && column.stats?.nullCount) {
    const nullRatio = column.stats.nullCount / dataset.rowCount;
    score -= nullRatio * 0.3;
  }

  return Math.max(0, Math.min(1, score));
}
```

## Legend Generation

### Dynamic Legend Creation

```typescript
interface Legend {
  type: 'choropleth' | 'proportional' | 'categorical' | 'bivariate';
  title: string;
  items: LegendItem[];
  orientation: 'vertical' | 'horizontal';
  position: { x: number; y: number };
}

interface LegendItem {
  label: string;
  symbol: 'rect' | 'circle' | 'line' | 'pattern';
  color?: string;
  size?: number;
  pattern?: Pattern;
}

export function generateLegend(
  visualization: VisualizationLayer
): Legend {
  switch (visualization.type) {
    case 'choropleth':
      return generateChoroplethLegend(
        visualization.breaks,
        visualization.colors,
        visualization.config
      );

    case 'proportional':
      return generateProportionalLegend(
        visualization.sizeScale,
        visualization.config
      );

    case 'categorical':
      return generateCategoricalLegend(
        visualization.categoryMap
      );

    case 'bivariate':
      return generateBivariateLegend(
        visualization.config
      );

    default:
      throw new Error(`Unknown visualization type: ${visualization.type}`);
  }
}

function generateChoroplethLegend(
  breaks: number[],
  colors: string[],
  config: ChoroplethConfig
): Legend {
  const items: LegendItem[] = [];

  for (let i = 0; i < breaks.length - 1; i++) {
    items.push({
      label: formatRange(breaks[i], breaks[i + 1]),
      symbol: 'rect',
      color: colors[i]
    });
  }

  return {
    type: 'choropleth',
    title: config.variable,
    items,
    orientation: 'vertical',
    position: { x: 20, y: 20 }
  };
}
```

## Real-time Updates

### Reactive Visualization

```typescript
class VisualizationStore {
  private _layers = $state<VisualizationLayer[]>([]);
  private _activeLayer = $state<string | null>(null);

  get layers() {
    return this._layers;
  }

  get activeLayer() {
    return this._layers.find(l => l.id === this._activeLayer);
  }

  addLayer(layer: VisualizationLayer): void {
    this._layers.push(layer);
    this._activeLayer = layer.id;
    this.updateMapLayers();
  }

  updateLayerConfig(layerId: string, config: Partial<any>): void {
    const layer = this._layers.find(l => l.id === layerId);
    if (layer) {
      Object.assign(layer.config, config);
      this.recalculateLayer(layer);
      this.updateMapLayers();
    }
  }

  private recalculateLayer(layer: VisualizationLayer): void {
    switch (layer.type) {
      case 'choropleth':
        // Recalculate breaks if classification changed
        if (layer.config.classification || layer.config.classes) {
          layer.breaks = calculateClassBreaks(
            layer.dataset.data,
            layer.config.variable,
            layer.config.classification,
            layer.config.classes
          );
        }
        // Regenerate colors
        layer.colors = generateColorPalette(
          layer.config.colorScheme,
          layer.config.classes
        );
        break;

      // Other visualization types...
    }

    // Regenerate legend
    layer.legend = generateLegend(layer);
  }

  private updateMapLayers(): void {
    // Convert visualization layers to Deck.gl layers
    const deckLayers = this._layers.map(layer =>
      this.createDeckLayer(layer)
    );

    // Update map
    mapStore.setLayers(deckLayers);
  }
}

export const visualizationStore = new VisualizationStore();
```

## Performance Optimization

### Data Aggregation

```typescript
function optimizeForVisualization(
  dataset: ProcessedDataset,
  visualization: VisualizationType
): ProcessedDataset {
  if (visualization === 'choropleth' && dataset.rowCount > 10000) {
    // Aggregate to reduce complexity
    return aggregateByGeometry(dataset);
  }

  if (visualization === 'proportional' && dataset.rowCount > 50000) {
    // Cluster nearby points
    return clusterPoints(dataset);
  }

  return dataset;
}
```

### Simplification

```typescript
async function simplifyGeometry(
  dataset: ProcessedDataset,
  tolerance: number = 0.001
): Promise<ProcessedDataset> {
  const simplified = await duckdb.query(`
    SELECT
      * EXCLUDE geom,
      ST_Simplify(geom, $1) as geom
    FROM dataset
    WHERE geom IS NOT NULL
  `, [tolerance]);

  return {
    ...dataset,
    data: simplified.toArray()
  };
}
```

## Testing

### Unit Tests

```typescript
describe('Visualization System', () => {
  test('suggests appropriate visualizations', () => {
    const dataset = createMockDataset({
      hasGeometry: true,
      numericColumns: 2,
      categoricalColumns: 1
    });

    const suggestions = suggestVisualizations(dataset);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].type).toBe('choropleth');
    expect(suggestions[0].score).toBeGreaterThan(0.5);
  });

  test('calculates class breaks correctly', async () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const breaks = await calculateClassBreaks(
      values.map(v => ({ value: v })),
      'value',
      ClassificationMethod.Quantile,
      3
    );

    expect(breaks).toEqual([1, 4, 7, 10]);
  });

  test('generates color palettes', () => {
    const palette = generateColorPalette('viridis', 5);

    expect(palette).toHaveLength(5);
    expect(palette[0]).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
```

## Configuration

### Default Settings

```typescript
const VISUALIZATION_DEFAULTS = {
  choropleth: {
    classification: ClassificationMethod.NaturalBreaks,
    classes: 5,
    colorScheme: 'viridis',
    opacity: 0.8,
    strokeWidth: 1,
    strokeColor: '#ffffff'
  },
  proportional: {
    symbolType: 'circle',
    minSize: 5,
    maxSize: 30,
    color: '#4575b4',
    opacity: 0.7,
    scalingMethod: 'sqrt'
  },
  categorical: {
    showOther: true,
    maxCategories: 12,
    defaultStyle: {
      size: 10
    }
  },
  bivariate: {
    classesX: 3,
    classesY: 3,
    colorMatrix: [
      ['#e8e8e8', '#ace4e4', '#5ac8c8'],
      ['#dfb0d6', '#a5add3', '#5698b9'],
      ['#be64ac', '#8c62aa', '#3b4994']
    ]
  }
};
```

## Best Practices

1. **Data Preparation**
   - Clean and validate data before visualization
   - Handle missing values appropriately
   - Consider data aggregation for large datasets

2. **Color Selection**
   - Use colorblind-safe palettes by default
   - Ensure sufficient contrast
   - Limit categorical colors to 7-12

3. **Classification**
   - Choose appropriate method for data distribution
   - Consider outliers in classification
   - Allow manual adjustment of breaks

4. **Performance**
   - Simplify geometry for web display
   - Implement level-of-detail rendering
   - Use data aggregation when appropriate

5. **User Experience**
   - Provide instant visual feedback
   - Allow undo/redo for changes
   - Save visualization presets