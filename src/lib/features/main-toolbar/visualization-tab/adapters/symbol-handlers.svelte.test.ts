import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createSymbolHandlers,
  type SymbolHandlersDeps
} from './symbol-handlers.svelte';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  },
  getSymbolPrimitive: vi.fn((viz) => viz?.symbol)
}));

vi.mock('../use-symbol-mode-state.svelte', () => ({
  resolveSymbolModeTransition: vi.fn(() => ({
    restoredStateFields: { size: 12 },
    nextModeStates: { unique: { size: 8 } }
  }))
}));

interface DepsBag {
  visualization: { id: string; symbol: Record<string, unknown> };
  updateSelectedVisualization: Mock;
  buildNextPrimitiveFilters: Mock;
  updatePrimitiveClassificationState: Mock;
  updatePrimitiveStrokeClassificationState: Mock;
  updateSymbolFillClassificationState: Mock;
  applyPrimitiveMappingUpdate: Mock;
  applyPrimitiveStrokeMappingUpdate: Mock;
  applySymbolFillMappingUpdate: Mock;
  invertPrimitivePalette: Mock;
  invertPrimitiveStrokePalette: Mock;
  invertSymbolFillPalette: Mock;
  ensurePrimitiveClassificationDefaults: Mock;
  ensureAutoColumns: Mock;
  ensureSymbolFillClassificationDefaults: Mock;
  ensureSymbolFillAutoColumns: Mock;
  ensurePrimitiveStrokeClassificationDefaults: Mock;
  ensurePrimitiveStrokeAutoColumns: Mock;
  handlers: ReturnType<typeof createSymbolHandlers>;
}

function makeBag(): DepsBag {
  const symbol = {
    enabled: true,
    mode: 'unique',
    fillMode: 'unique',
    strokeMode: 'unique',
    fillColor: '#abc',
    fillColorB: '#aaa',
    strokeColor: '#000',
    strokeWidth: 1,
    strokeOpacity: 1,
    strokeDashed: false,
    shape: 'circle',
    size: 8,
    minSize: 4,
    maxSize: 24,
    sizeScale: 'linear',
    opacity: 0.9,
    proportionalType: 'absolute',
    categoryShape: 'unique',
    modeStates: {},
    missingData: { color: '#fff', show: true }
  };
  const visualization = { id: 'viz', symbol };
  const mocks = {
    updateSelectedVisualization: vi.fn(),
    buildNextPrimitiveFilters: vi.fn().mockReturnValue([]),
    updatePrimitiveClassificationState: vi.fn(),
    updatePrimitiveStrokeClassificationState: vi.fn(),
    updateSymbolFillClassificationState: vi.fn(),
    applyPrimitiveMappingUpdate: vi.fn(),
    applyPrimitiveStrokeMappingUpdate: vi.fn(),
    applySymbolFillMappingUpdate: vi.fn(),
    invertPrimitivePalette: vi.fn(),
    invertPrimitiveStrokePalette: vi.fn(),
    invertSymbolFillPalette: vi.fn(),
    ensurePrimitiveClassificationDefaults: vi.fn(),
    ensureAutoColumns: vi.fn(),
    ensureSymbolFillClassificationDefaults: vi.fn(),
    ensureSymbolFillAutoColumns: vi.fn(),
    ensurePrimitiveStrokeClassificationDefaults: vi.fn(),
    ensurePrimitiveStrokeAutoColumns: vi.fn()
  };
  const deps = {
    getSelectedVisualization: () => visualization,
    ...mocks
  } as unknown as SymbolHandlersDeps;
  const handlers = createSymbolHandlers(deps);
  return { visualization, ...mocks, handlers };
}

describe('createSymbolHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleSymbolStyleChange renames symbolFillColor → fillColor', () => {
    const bag = makeBag();
    bag.handlers.handleSymbolStyleChange({
      symbolFillColor: '#fff'
    } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.symbol.fillColor).toBe('#fff');
  });

  it('handleSymbolModesChange triggers ensure callbacks for symbol fill + stroke', () => {
    const bag = makeBag();
    bag.handlers.handleSymbolModesChange({
      symbol: 'classes'
    } as never);
    const [, afterUpdate] = bag.updateSelectedVisualization.mock.calls[0];
    afterUpdate({ id: 'next' });
    expect(bag.ensurePrimitiveClassificationDefaults).toHaveBeenCalledWith(
      'point',
      { id: 'next' }
    );
    expect(bag.ensureSymbolFillClassificationDefaults).toHaveBeenCalled();
    expect(bag.ensureSymbolFillAutoColumns).toHaveBeenCalled();
    expect(bag.ensurePrimitiveStrokeClassificationDefaults).toHaveBeenCalled();
  });

  it('handleSymbolsChange renames type → shape', () => {
    const bag = makeBag();
    bag.handlers.handleSymbolsChange({ type: 'square', barWidth: 9 } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.symbol.shape).toBe('square');
    expect(arg.symbol.barWidth).toBe(9);
  });

  it('handleSymbolFillClassificationChange delegates to symbol fill setter', () => {
    const bag = makeBag();
    bag.handlers.handleSymbolFillClassificationChange({
      method: 'jenks'
    } as never);
    expect(bag.updateSymbolFillClassificationState).toHaveBeenCalledWith({
      method: 'jenks'
    });
  });

  it('handleSymbolStrokeClassificationChange delegates to stroke state setter for POINT', () => {
    const bag = makeBag();
    bag.handlers.handleSymbolStrokeClassificationChange({
      colors: ['#abc']
    } as never);
    expect(bag.updatePrimitiveStrokeClassificationState).toHaveBeenCalledWith(
      'point',
      { colors: ['#abc'] }
    );
  });
});
