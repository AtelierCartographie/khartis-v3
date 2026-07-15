import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    LINE: 'line',
    POLYGON: 'polygon',
    TEXT: 'text'
  },
  ScaleType: { LINEAR: 'linear', SQRT: 'sqrt', LOG: 'log' },
  VisualizationType: { PROPORTIONAL: 'proportional' },
  getEnabledPrimitiveFilters: (
    viz: { primitiveFilters?: string[] } | undefined
  ) => viz?.primitiveFilters ?? [],
  getLinePrimitive: (viz: { line?: unknown } | undefined) => viz?.line,
  getLineThicknessClassification: (
    viz:
      | {
          lineThicknessClassification?: unknown;
          line?: { thicknessClassification?: unknown };
        }
      | undefined
  ) => viz?.lineThicknessClassification ?? viz?.line?.thicknessClassification,
  getPolygonPrimitive: (viz: { polygon?: unknown } | undefined) => viz?.polygon,
  getPrimitiveCategoryColumn: (
    viz:
      | {
          symbol?: { categoryColumn?: string };
          line?: { categoryColumn?: string };
          polygon?: { categoryColumn?: string };
        }
      | undefined,
    primitive: string
  ) =>
    primitive === 'point'
      ? viz?.symbol?.categoryColumn
      : primitive === 'line'
        ? viz?.line?.categoryColumn
        : viz?.polygon?.categoryColumn,
  getPrimitiveClassification: (
    viz:
      | {
          classification?: unknown;
          symbolClassification?: unknown;
          symbol?: { classification?: unknown };
          lineClassification?: unknown;
          line?: { thicknessClassification?: unknown };
        }
      | undefined,
    primitive: string
  ) =>
    primitive === 'point'
      ? (viz?.symbol?.classification ?? viz?.symbolClassification)
      : primitive === 'line'
        ? (viz?.lineClassification ?? viz?.line?.thicknessClassification)
        : viz?.classification,
  getPrimitiveValueColumn: (
    viz:
      | {
          symbol?: { valueColumn?: string };
          line?: { valueColumn?: string };
          polygon?: { valueColumn?: string };
        }
      | undefined,
    primitive: string
  ) =>
    primitive === 'point'
      ? viz?.symbol?.valueColumn
      : primitive === 'line'
        ? viz?.line?.valueColumn
        : viz?.polygon?.valueColumn,
  getSymbolFillCategoryColumn: (
    viz: { symbol?: { fillCategoryColumn?: string } } | undefined
  ) => viz?.symbol?.fillCategoryColumn,
  getSymbolFillClassification: (
    viz: { symbol?: { fillClassification?: unknown } } | undefined
  ) => viz?.symbol?.fillClassification,
  getSymbolFillValueColumn: (
    viz: { symbol?: { fillValueColumn?: string } } | undefined
  ) => viz?.symbol?.fillValueColumn,
  getSymbolPrimitive: (viz: { symbol?: unknown } | undefined) => viz?.symbol
}));
import {
  PrimitiveFilterType,
  ScaleType,
  VisualizationType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  FillMode,
  ShapeType,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  getLineWidthLegendScale,
  getPointSizeLegendScale,
  type PointSizeLegendScale
} from '$lib/features/map/utils/legend.utils';
import { getProportionalLineWidthForValue } from '$lib/features/map/utils/data-styling.utils';

function createProportionalSymbolViz(shape: ShapeType): VisualizationConfig {
  return {
    id: 'viz-symbol-legend',
    name: 'Symbol legend',
    type: VisualizationType.PROPORTIONAL,
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: [PrimitiveFilterType.POINT],
    primitiveOrder: [PrimitiveFilterType.POINT],
    symbol: {
      enabled: true,
      mode: SymbolMode.PROPORTIONAL,
      shape,
      sizeColumn: 'population',
      minSize: 8,
      maxSize: 40,
      sizeScale: ScaleType.LINEAR,
      fillMode: FillMode.UNIQUE,
      fillColor: '#3366cc',
      strokeMode: StrokeMode.NONE,
      strokeColor: '#000000',
      strokeWidth: 0,
      strokeOpacity: 0
    },
    mapping: {
      sizeColumn: 'population'
    }
  } as VisualizationConfig;
}

function getContinuousValues(scale: PointSizeLegendScale | null): number[] {
  return (
    scale?.steps.map((step) =>
      step.kind === 'continuous' ? step.value : Number.NaN
    ) ?? []
  );
}

describe('getPointSizeLegendScale', () => {
  it('uses the proportional symbol zero-to-max square-root radius contract', () => {
    const scale = getPointSizeLegendScale(
      createProportionalSymbolViz(ShapeType.CIRCLE),
      {
        min: 25,
        max: 100
      }
    );

    expect(getContinuousValues(scale)).toEqual([100, 50, 0]);
    expect(scale?.steps.map((step) => step.size)).toEqual([
      40,
      Math.sqrt(0.5) * 40,
      0
    ]);
  });

  it('keeps bar and spike legends linear on the zero-to-max domain', () => {
    const scale = getPointSizeLegendScale(
      createProportionalSymbolViz(ShapeType.BAR),
      {
        min: 0,
        max: 100
      }
    );

    expect(scale?.steps.map((step) => step.size)).toEqual([40, 20, 0]);
  });

  it('keeps spike legends linear on the zero-to-max domain', () => {
    const scale = getPointSizeLegendScale(
      createProportionalSymbolViz(ShapeType.SPIKE),
      {
        min: 25,
        max: 100
      }
    );

    expect(getContinuousValues(scale)).toEqual([100, 50, 0]);
    expect(scale?.steps.map((step) => step.size)).toEqual([40, 20, 0]);
  });

  it('renders a zero-only proportional legend when max is not positive', () => {
    const scale = getPointSizeLegendScale(
      createProportionalSymbolViz(ShapeType.CIRCLE),
      {
        min: 0,
        max: 0
      }
    );

    expect(scale?.steps).toEqual([
      {
        kind: 'continuous',
        value: 0,
        size: 0
      }
    ]);
  });
});

function createProportionalLineViz(): VisualizationConfig {
  return {
    id: 'viz-line-legend',
    name: 'Line legend',
    type: VisualizationType.PROPORTIONAL,
    datasetId: 'dataset-1',
    enabled: true,
    primitiveFilters: [PrimitiveFilterType.LINE],
    line: {
      enabled: true,
      thicknessMode: ThicknessMode.PROPORTIONAL,
      sizeColumn: 'flow',
      color: '#3366cc',
      width: 3,
      maxWidth: 8,
      opacity: 1,
      dashed: false
    },
    mapping: {
      sizeColumn: 'flow'
    }
  } as VisualizationConfig;
}

describe('getLineWidthLegendScale', () => {
  it('shares the strictly proportional width function with the render path (WYSIWYG)', () => {
    const scale = getLineWidthLegendScale(createProportionalLineViz(), {
      min: -200,
      max: 100
    });

    expect(scale?.kind).toBe('proportional');
    expect(
      scale?.steps.map((step) =>
        step.kind === 'continuous' ? step.value : Number.NaN
      )
    ).toEqual([200, 100, 0]);
    expect(scale?.steps.map((step) => step.size)).toEqual([
      getProportionalLineWidthForValue(200, 200, 8),
      getProportionalLineWidthForValue(100, 200, 8),
      getProportionalLineWidthForValue(0, 200, 8)
    ]);
    expect(scale?.steps.map((step) => step.size)).toEqual([8, 4, 0]);
  });

  it('renders a zero-only proportional legend when the magnitude domain is not positive', () => {
    const scale = getLineWidthLegendScale(createProportionalLineViz(), {
      min: 0,
      max: 0
    });

    expect(scale?.steps).toEqual([
      {
        kind: 'continuous',
        value: 0,
        size: 0
      }
    ]);
  });
});
