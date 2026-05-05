import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  },
  getLinePrimitive: vi.fn((viz) => viz?.line),
  getPolygonPrimitive: vi.fn((viz) => viz?.polygon),
  getSymbolPrimitive: vi.fn((viz) => viz?.symbol),
  getTextPrimitive: vi.fn((viz) => viz?.text)
}));

vi.mock('../hooks/use-symbol-mode-state.svelte', () => ({
  resolveSymbolModeTransition: vi.fn(() => ({
    restoredStateFields: {},
    nextModeStates: {}
  }))
}));

vi.mock('../hooks/use-line-mode-state.svelte', () => ({
  resolveLineModeTransition: vi.fn(() => ({
    nextLineUpdates: {},
    nextMappingUpdates: {},
    nextVisualizationUpdates: {}
  }))
}));

import {
  usePrimitiveAdapters,
  type PrimitiveAdaptersDeps
} from './use-primitive-adapters.svelte';

interface DepsBag {
  visualization: { id: string } & Record<string, unknown>;
  updateSelectedVisualization: Mock;
  updatePrimitiveStrokeClassificationState: Mock;
  applyStrokePolygonClassificationUpdate: Mock;
  handlers: ReturnType<typeof usePrimitiveAdapters>;
}

function makeBag(): DepsBag {
  const visualization = {
    id: 'viz',
    polygon: { enabled: true, fillMode: 'unique' },
    symbol: { enabled: true, mode: 'unique', fillMode: 'unique' },
    line: { enabled: true, colorMode: 'unique' },
    text: {
      colorMode: 'unique',
      sizeMode: 'fixed',
      background: { fillMode: 'none', strokeMode: 'none' }
    }
  };
  const updateSelectedVisualization = vi.fn();
  const updatePrimitiveStrokeClassificationState = vi.fn();
  const applyStrokePolygonClassificationUpdate = vi.fn();
  const noOp = vi.fn();
  const deps = {
    getSelectedVisualization: () => visualization as never,
    updateSelectedVisualization,
    buildNextPrimitiveFilters: vi.fn().mockReturnValue([]),
    updatePrimitiveClassificationState: noOp,
    updatePrimitiveStrokeClassificationState,
    updateLineThicknessClassificationState: noOp,
    updateSymbolFillClassificationState: noOp,
    updateTextBackgroundClassificationState: noOp,
    updateTextBackgroundStrokeClassificationState: noOp,
    applyPrimitiveMappingUpdate: noOp,
    applyPrimitiveStrokeMappingUpdate: noOp,
    applySymbolFillMappingUpdate: noOp,
    applyTextBackgroundMappingUpdate: noOp,
    applyTextBackgroundStrokeMappingUpdate: noOp,
    invertPrimitivePalette: noOp,
    invertPrimitiveStrokePalette: noOp,
    invertSymbolFillPalette: noOp,
    invertTextBackgroundPalette: noOp,
    invertTextBackgroundStrokePalette: noOp,
    updateTextBackground: vi.fn(),
    ensurePrimitiveClassificationDefaults: noOp,
    ensureAutoColumns: noOp,
    ensureSymbolFillClassificationDefaults: noOp,
    ensureSymbolFillAutoColumns: noOp,
    ensurePrimitiveStrokeClassificationDefaults: noOp,
    ensurePrimitiveStrokeAutoColumns: noOp,
    ensureTextBackgroundClassificationDefaults: noOp,
    ensureTextBackgroundAutoColumns: noOp,
    ensureTextBackgroundStrokeClassificationDefaults: noOp,
    ensureTextBackgroundStrokeAutoColumns: noOp,
    applyStrokePolygonClassificationUpdate
  } satisfies PrimitiveAdaptersDeps;
  return {
    visualization: visualization as never,
    updateSelectedVisualization,
    updatePrimitiveStrokeClassificationState,
    applyStrokePolygonClassificationUpdate,
    handlers: usePrimitiveAdapters(deps)
  };
}

describe('usePrimitiveAdapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes all polygon handlers', () => {
    const { handlers } = makeBag();
    expect(typeof handlers.handlePolygonChange).toBe('function');
    expect(typeof handlers.handlePolygonStyleChange).toBe('function');
    expect(typeof handlers.handlePolygonModesChange).toBe('function');
    expect(typeof handlers.handlePolygonClassificationChange).toBe('function');
    expect(typeof handlers.handlePolygonDensityChange).toBe('function');
  });

  it('exposes all symbol handlers', () => {
    const { handlers } = makeBag();
    expect(typeof handlers.handleSymbolChange).toBe('function');
    expect(typeof handlers.handleSymbolModesChange).toBe('function');
    expect(typeof handlers.handleSymbolFillClassificationChange).toBe(
      'function'
    );
    expect(typeof handlers.handleSymbolStrokeClassificationChange).toBe(
      'function'
    );
  });

  it('exposes all line handlers', () => {
    const { handlers } = makeBag();
    expect(typeof handlers.handleLineChange).toBe('function');
    expect(typeof handlers.handleLineModesChange).toBe('function');
    expect(typeof handlers.handleLineThicknessClassificationChange).toBe(
      'function'
    );
  });

  it('exposes all text handlers', () => {
    const { handlers } = makeBag();
    expect(typeof handlers.handleTextChange).toBe('function');
    expect(typeof handlers.handleTextBackgroundModesChange).toBe('function');
    expect(typeof handlers.handleTextBackgroundStrokeClassificationChange).toBe(
      'function'
    );
  });

  it('handlePolygonStrokeClassificationChange routes through deps callback', () => {
    const bag = makeBag();
    bag.handlers.handlePolygonStrokeClassificationChange({
      method: 'jenks'
    } as never);
    expect(bag.applyStrokePolygonClassificationUpdate).toHaveBeenCalledWith({
      method: 'jenks'
    });
  });

  it('does not produce duplicate handler keys across primitives', () => {
    const { handlers } = makeBag();
    const keys = Object.keys(handlers);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('shares the same getSelectedVisualization reference across all 4 adapters', () => {
    const bag = makeBag();
    bag.handlers.handlePolygonChange({ fillColor: '#aaa' } as never);
    bag.handlers.handleSymbolChange({ size: 12 } as never);
    bag.handlers.handleLineChange({ width: 3 } as never);
    bag.handlers.handleTextChange({ size: 14 } as never);
    expect(bag.updateSelectedVisualization).toHaveBeenCalledTimes(4);
  });
});
