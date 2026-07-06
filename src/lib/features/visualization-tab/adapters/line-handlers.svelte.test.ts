import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createLineHandlers,
  type LineHandlersDeps
} from './line-handlers.svelte';

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  },
  getLinePrimitive: vi.fn((viz) => viz?.line)
}));

vi.mock('../hooks/use-line-mode-state.svelte', () => ({
  resolveLineModeTransition: vi.fn(() => ({
    nextLineUpdates: { colorMode: 'classes' },
    nextMappingUpdates: { valueColumn: 'next-col' },
    nextVisualizationUpdates: { lineClassification: { method: 'jenks' } }
  }))
}));

interface DepsBag {
  visualization: {
    id: string;
    line: Record<string, unknown>;
    mapping?: unknown;
  };
  updateSelectedVisualization: Mock;
  buildNextPrimitiveFilters: Mock;
  updatePrimitiveClassificationState: Mock;
  updateLineThicknessClassificationState: Mock;
  applyPrimitiveMappingUpdate: Mock;
  invertPrimitivePalette: Mock;
  ensurePrimitiveClassificationDefaults: Mock;
  ensureAutoColumns: Mock;
  handlers: ReturnType<typeof createLineHandlers>;
}

function makeBag(): DepsBag {
  const line = {
    enabled: true,
    color: '#abc',
    opacity: 0.7,
    width: 2,
    maxWidth: 8,
    dashed: false,
    dashedPattern: 'dots',
    valueColumn: 'col',
    colorMode: 'unique',
    thicknessMode: 'unique',
    missingData: { color: '#fff', show: true }
  };
  const visualization = { id: 'viz', line, mapping: {} };
  const mocks = {
    updateSelectedVisualization: vi.fn(),
    buildNextPrimitiveFilters: vi.fn().mockReturnValue([]),
    updatePrimitiveClassificationState: vi.fn(),
    updateLineThicknessClassificationState: vi.fn(),
    applyPrimitiveMappingUpdate: vi.fn(),
    invertPrimitivePalette: vi.fn(),
    ensurePrimitiveClassificationDefaults: vi.fn(),
    ensureAutoColumns: vi.fn()
  };
  const deps = {
    getSelectedVisualization: () => visualization,
    ...mocks
  } as unknown as LineHandlersDeps;
  const handlers = createLineHandlers(deps);
  return { visualization, ...mocks, handlers };
}

describe('createLineHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleLineStyleChange renames lineColor → color, lineOpacity → opacity', () => {
    const bag = makeBag();
    bag.handlers.handleLineStyleChange({
      lineColor: '#fff',
      lineOpacity: 0.3
    } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.line.color).toBe('#fff');
    expect(arg.line.opacity).toBe(0.3);
  });

  it('handleLineStyleChange renames line dashed pattern into line state', () => {
    const bag = makeBag();
    bag.handlers.handleLineStyleChange({
      lineDashed: true,
      lineDashedPattern: 'dashes'
    } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.line.dashed).toBe(true);
    expect(arg.line.dashedPattern).toBe('dashes');
  });

  it('handleLineStyleChange falls back to existing opacity when undefined provided', () => {
    const bag = makeBag();
    bag.handlers.handleLineStyleChange({ lineOpacity: undefined } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.line.opacity).toBe(0.7);
  });

  it('handleLineModesChange threads modeTransition results through update', () => {
    const bag = makeBag();
    bag.handlers.handleLineModesChange({ color: 'classes' } as never);
    const [updates, afterUpdate] =
      bag.updateSelectedVisualization.mock.calls[0];
    expect(updates.lineClassification).toEqual({ method: 'jenks' });
    expect(updates.line.colorMode).toBe('classes');
    expect(updates.mapping.valueColumn).toBe('next-col');

    afterUpdate({ id: 'next' });
    expect(bag.ensurePrimitiveClassificationDefaults).toHaveBeenCalledWith(
      'line',
      { id: 'next' }
    );
    expect(bag.ensureAutoColumns).toHaveBeenCalled();
  });

  it('handleLineThicknessClassificationChange delegates to thickness state setter', () => {
    const bag = makeBag();
    bag.handlers.handleLineThicknessClassificationChange({
      method: 'quantile'
    } as never);
    expect(bag.updateLineThicknessClassificationState).toHaveBeenCalledWith({
      method: 'quantile'
    });
  });

  it('handleLineThicknessClassificationChange forwards preserve-origin updates', () => {
    const bag = makeBag();
    bag.handlers.handleLineThicknessClassificationChange(
      { breaks: [1, 2] } as never,
      { preserveOrigin: true }
    );
    expect(bag.updateLineThicknessClassificationState).toHaveBeenCalledWith(
      { breaks: [1, 2] },
      { preserveOrigin: true }
    );
  });

  it('handleLineChange recomputes primitiveFilters from the line enabled override', () => {
    const bag = makeBag();
    bag.handlers.handleLineChange({ enabled: false } as never);
    expect(bag.buildNextPrimitiveFilters).toHaveBeenCalledWith({
      line: false
    });
  });

  it('handleLinePaletteInvert delegates to invertPrimitivePalette', () => {
    const bag = makeBag();
    bag.handlers.handleLinePaletteInvert();
    expect(bag.invertPrimitivePalette).toHaveBeenCalledWith('line');
  });
});
