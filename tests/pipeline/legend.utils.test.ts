import { describe, expect, it, vi } from 'vitest';

const visualizationStoreEnums = vi.hoisted(() => ({
  ClassificationMethod: {
    QUANTILES: 'quantiles'
  },
  PrimitiveFilterType: {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon'
  },
  ScaleType: {
    LINEAR: 'linear',
    SQRT: 'sqrt',
    LOG: 'log'
  },
  VisualizationType: {
    CHOROPLETH: 'choropleth',
    PROPORTIONAL: 'proportional',
    CATEGORICAL: 'categorical',
    BIVARIATE: 'bivariate'
  }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ...visualizationStoreEnums
}));

import {
  ClassificationMethod,
  PrimitiveFilterType,
  ScaleType,
  VisualizationType,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  ColorMode,
  FillMode,
  MissingDataShape,
  ShapeType,
  SymbolMode,
  ThicknessMode
} from '$lib/features/main-toolbar/constants';
import {
  getLineWidthLegendScale,
  getPointSizeLegendScale,
  hasCategoricalColorLegend,
  hasClassedColorLegend,
  resolveLegendColorSwatchPrimitive,
  resolveMissingDataLegendPrimitive,
  resolveMissingDataPointShape
} from '$lib/features/map/utils/legend.utils';

function createVisualization(
  overrides: Partial<VisualizationConfig> = {}
): VisualizationConfig {
  return {
    id: 'viz-id',
    name: 'Legend test',
    type: VisualizationType.CHOROPLETH,
    datasetId: 'dataset-id',
    enabled: true,
    primitiveFilters: [PrimitiveFilterType.POLYGON],
    modes: {
      symbol: SymbolMode.UNIQUE,
      fill: FillMode.CLASSES
    },
    style: {
      fillColor: '#4589ff',
      fillOpacity: 0.8,
      strokeColor: '#1e3a5f',
      strokeWidth: 1,
      strokeOpacity: 1,
      lineColor: '#1e3a5f',
      lineOpacity: 1,
      lineWidth: 2,
      lineMaxWidth: 10,
      lineDashed: false
    },
    mapping: {
      valueColumn: 'value',
      categoryColumn: 'category',
      sizeColumn: 'size'
    },
    classification: {
      method: ClassificationMethod.QUANTILES,
      classes: 4,
      numClasses: 4,
      breaks: [10, 20, 30],
      colors: ['#edf5ff', '#9ecae1', '#3182bd', '#08519c'],
      labels: ['A', 'B', 'C', 'D']
    },
    symbols: {
      type: ShapeType.CIRCLE,
      minSize: 2,
      maxSize: 12,
      sizeScale: ScaleType.SQRT
    },
    missingData: {
      show: true,
      shape: MissingDataShape.CIRCLE,
      size: 6,
      color: '#c6c6c6'
    },
    ...overrides
  };
}

describe('legend utils', () => {
  it('maps missing-data cross to a real cross symbol', () => {
    expect(resolveMissingDataPointShape(MissingDataShape.CROSS)).toBe(
      ShapeType.CROSS
    );
  });

  it('uses point swatches for proportional symbol legends', () => {
    const visualization = createVisualization({
      type: VisualizationType.PROPORTIONAL,
      primitiveFilters: [PrimitiveFilterType.POINT, PrimitiveFilterType.LINE],
      modes: {
        symbol: SymbolMode.PROPORTIONAL,
        fill: FillMode.CLASSES
      }
    });

    expect(resolveLegendColorSwatchPrimitive(visualization)).toBe('point');
  });

  it('uses line swatches when the visualization is configured through line modes', () => {
    const visualization = createVisualization({
      type: VisualizationType.CATEGORICAL,
      primitiveFilters: [PrimitiveFilterType.LINE],
      modes: {
        color: ColorMode.CLASSES,
        thickness: ThicknessMode.CLASSES
      }
    });

    expect(resolveLegendColorSwatchPrimitive(visualization)).toBe('line');
    expect(resolveMissingDataLegendPrimitive(visualization)).toBe('point');
  });

  it('detects both classed and categorical color legends across fill and line modes', () => {
    const classedLine = createVisualization({
      primitiveFilters: [PrimitiveFilterType.LINE],
      modes: {
        color: ColorMode.CLASSES
      }
    });
    const categoricalPoint = createVisualization({
      type: VisualizationType.CATEGORICAL,
      primitiveFilters: [PrimitiveFilterType.POINT],
      modes: {
        symbol: SymbolMode.CATEGORIES,
        fill: FillMode.CATEGORIES
      }
    });

    expect(hasClassedColorLegend(classedLine)).toBe(true);
    expect(hasCategoricalColorLegend(categoricalPoint)).toBe(true);
  });

  it('builds a discrete size legend for classed point symbols with the configured shape', () => {
    const visualization = createVisualization({
      type: VisualizationType.PROPORTIONAL,
      primitiveFilters: [PrimitiveFilterType.POINT],
      modes: {
        symbol: SymbolMode.CLASSES,
        fill: FillMode.UNIQUE
      },
      symbols: {
        type: ShapeType.SQUARE,
        minSize: 3,
        maxSize: 15,
        sizeScale: ScaleType.LINEAR
      }
    });

    const scale = getPointSizeLegendScale(visualization, null);

    expect(scale?.kind).toBe('classes');
    expect(scale?.shape).toBe(ShapeType.SQUARE);
    expect(scale?.steps).toHaveLength(4);
    expect(scale?.steps[0]?.size).toBeGreaterThan(scale?.steps[3]?.size ?? 0);
  });

  it('builds a proportional width legend for lines from dataset statistics', () => {
    const baseVisualization = createVisualization();
    const visualization = createVisualization({
      primitiveFilters: [PrimitiveFilterType.LINE],
      modes: {
        color: ColorMode.UNIQUE,
        thickness: ThicknessMode.PROPORTIONAL
      },
      style: {
        ...baseVisualization.style,
        lineColor: '#ff832b',
        lineOpacity: 0.75,
        lineDashed: true,
        lineMaxWidth: 12
      }
    });

    const scale = getLineWidthLegendScale(visualization, {
      min: 10,
      max: 110
    });

    expect(scale?.kind).toBe('proportional');
    expect(scale?.steps).toHaveLength(3);
    expect(scale?.color).toBe('#ff832b');
    expect(scale?.dashed).toBe(true);
    expect(scale?.steps[0]?.size).toBeGreaterThan(scale?.steps[2]?.size ?? 0);
  });
});
