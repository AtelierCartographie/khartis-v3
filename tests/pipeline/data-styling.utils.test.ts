import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
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

import {
  ScaleType,
  VisualizationType
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  DEFAULT_COLORS,
  FillMode,
  ShapeType,
  SymbolMode
} from '$lib/features/main-toolbar/constants';
import {
  getColorForValue,
  hasCompleteCategoricalColorMap,
  getClassedSizeForValue,
  getSizeForValue,
  shouldApplyProportionalSymbols
} from '$lib/features/map/utils/data-styling.utils';

interface VisualizationConfigLike {
  id: string;
  name: string;
  type: (typeof VisualizationType)[keyof typeof VisualizationType];
  datasetId: string;
  enabled: boolean;
  modes?: {
    symbol?: SymbolMode;
    fill?: FillMode;
  };
  style: {
    fillColor?: string;
  };
  mapping: {
    sizeColumn?: string;
  };
  symbols?: {
    type: ShapeType;
    minSize: number;
    maxSize: number;
    sizeScale: (typeof ScaleType)[keyof typeof ScaleType];
  };
}

function createVisualizationConfig(
  overrides: Partial<VisualizationConfigLike> = {}
): VisualizationConfigLike {
  const baseConfig = {
    id: 'viz-1',
    name: 'Audit',
    type: VisualizationType.CATEGORICAL,
    datasetId: 'dataset-1',
    enabled: true,
    modes: {
      symbol: SymbolMode.UNIQUE,
      fill: FillMode.UNIQUE
    },
    style: {
      fillColor: DEFAULT_COLORS.fill
    },
    mapping: {
      sizeColumn: 'size'
    },
    symbols: {
      type: ShapeType.CIRCLE,
      minSize: 4,
      maxSize: 20,
      sizeScale: ScaleType.LINEAR
    }
  } satisfies VisualizationConfigLike;

  return {
    ...baseConfig,
    ...overrides,
    modes: {
      ...baseConfig.modes,
      ...overrides.modes
    },
    style: {
      ...baseConfig.style,
      ...overrides.style
    },
    mapping: {
      ...baseConfig.mapping,
      ...overrides.mapping
    },
    symbols: {
      ...baseConfig.symbols,
      ...overrides.symbols
    }
  };
}

describe('data styling utils', () => {
  it('maps choropleth colors correctly when breaks are internal thresholds', () => {
    const colors = ['#111111', '#222222', '#333333', '#444444', '#555555'];
    const breaks = [771076.8, 1260693.8, 1812647, 2573055];

    expect(getColorForValue(500000, breaks, colors)).toEqual([17, 17, 17]);
    expect(getColorForValue(1579967, breaks, colors)).toEqual([51, 51, 51]);
    expect(getColorForValue(3000000, breaks, colors)).toEqual([85, 85, 85]);
  });

  it('keeps supporting legacy choropleth breaks stored as class lower bounds', () => {
    const colors = ['#111111', '#222222', '#333333', '#444444', '#555555'];
    const breaks = [3205877, 6381396, 9556914, 12732433, 15907951];

    expect(getColorForValue(3500000, breaks, colors)).toEqual([17, 17, 17]);
    expect(getColorForValue(7000000, breaks, colors)).toEqual([34, 34, 34]);
    expect(getColorForValue(16000000, breaks, colors)).toEqual([85, 85, 85]);
  });

  it('uses discrete steps for classed sizes', () => {
    const breaks = [0, 10, 20, 30];

    expect(getClassedSizeForValue(5, breaks, 4, 16)).toBe(4);
    expect(getClassedSizeForValue(15, breaks, 4, 16)).toBe(10);
    expect(getClassedSizeForValue(25, breaks, 4, 16)).toBe(16);
  });

  it('uses all classes when classed sizes receive internal thresholds', () => {
    const breaks = [771076.8, 1260693.8, 1812647, 2573055];

    expect(getClassedSizeForValue(500000, breaks, 4, 20, 5)).toBe(4);
    expect(getClassedSizeForValue(1000000, breaks, 4, 20, 5)).toBe(8);
    expect(getClassedSizeForValue(1579967, breaks, 4, 20, 5)).toBe(12);
    expect(getClassedSizeForValue(2200000, breaks, 4, 20, 5)).toBe(16);
    expect(getClassedSizeForValue(3000000, breaks, 4, 20, 5)).toBe(20);
  });

  it('clamps proportional sizes to the configured symbol range', () => {
    expect(getSizeForValue(-10, 0, 100, 4, 20, ScaleType.LINEAR)).toBe(4);
    expect(getSizeForValue(150, 0, 100, 4, 20, ScaleType.LINEAR)).toBe(20);
  });

  it('detects when a categorical color map is incomplete for full categories', () => {
    const partialMap = new Map<string, [number, number, number]>([
      ['Beta', [17, 17, 17]],
      ['Gamma', [34, 34, 34]]
    ]);

    expect(
      hasCompleteCategoricalColorMap(['Alpha', 'Beta', 'Gamma'], partialMap)
    ).toBe(false);
    expect(hasCompleteCategoricalColorMap(['Beta', 'Gamma'], partialMap)).toBe(
      true
    );
  });

  it('lets symbol mode override a legacy proportional visualization type', () => {
    const uniqueViz = createVisualizationConfig({
      type: VisualizationType.PROPORTIONAL,
      modes: { symbol: SymbolMode.UNIQUE }
    });

    expect(shouldApplyProportionalSymbols(uniqueViz)).toBe(false);
  });

  it('enables proportional symbol sizing from the active symbol mode', () => {
    const proportionalViz = createVisualizationConfig({
      type: VisualizationType.CATEGORICAL,
      modes: { symbol: SymbolMode.PROPORTIONAL }
    });

    expect(shouldApplyProportionalSymbols(proportionalViz)).toBe(true);
  });
});
