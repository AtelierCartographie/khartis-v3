import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createTextHandlers,
  type TextHandlersDeps
} from './text-handlers.svelte';

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  },
  getTextPrimitive: vi.fn((viz) => viz?.text)
}));

interface DepsBag {
  visualization: { id: string; text: Record<string, unknown> };
  updateSelectedVisualization: Mock;
  buildNextPrimitiveFilters: Mock;
  updatePrimitiveClassificationState: Mock;
  applyPrimitiveMappingUpdate: Mock;
  invertPrimitivePalette: Mock;
  ensurePrimitiveClassificationDefaults: Mock;
  ensureAutoColumns: Mock;
  handlers: ReturnType<typeof createTextHandlers>;
}

function makeBag(): DepsBag {
  const text = {
    enabled: true,
    color: '#abc',
    opacity: 0.8,
    fontFamily: 'Arial',
    bold: false,
    italic: false,
    size: 12,
    align: 'left',
    halo: false,
    haloColor: '#fff',
    haloWidth: 1,
    collisionDetection: true,
    dxpMasking: false,
    colorMode: 'unique',
    sizeMode: 'fixed',
    secondaryLabels: { enabled: false },
    missingData: { color: '#fff', show: true }
  };
  const visualization = { id: 'viz', text };
  const mocks = {
    updateSelectedVisualization: vi.fn(),
    buildNextPrimitiveFilters: vi.fn().mockReturnValue([]),
    updatePrimitiveClassificationState: vi.fn(),
    applyPrimitiveMappingUpdate: vi.fn(),
    invertPrimitivePalette: vi.fn(),
    ensurePrimitiveClassificationDefaults: vi.fn(),
    ensureAutoColumns: vi.fn()
  };
  const deps = {
    getSelectedVisualization: () => visualization,
    ...mocks
  } as unknown as TextHandlersDeps;
  const handlers = createTextHandlers(deps);
  return { visualization, ...mocks, handlers };
}

describe('createTextHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleTextStyleChange renames textXxx → xxx with fallback to text', () => {
    const bag = makeBag();
    bag.handlers.handleTextStyleChange({
      textColor: '#fff',
      textOpacity: undefined,
      textSize: 14
    } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.text.color).toBe('#fff');
    expect(arg.text.opacity).toBe(0.8);
    expect(arg.text.size).toBe(14);
  });

  it('handleTextChange recomputes primitiveFilters from the text enabled override', () => {
    const bag = makeBag();
    bag.handlers.handleTextChange({ enabled: false } as never);
    expect(bag.buildNextPrimitiveFilters).toHaveBeenCalledWith({
      text: false
    });
  });

  it('handleTextStyleChange dual-writes the legacy style mirror so the picker UI does not revert', () => {
    const bag = makeBag();
    bag.handlers.handleTextStyleChange({
      textFontFamily: 'Inter',
      textColor: '#fff',
      textSize: 14,
      textBold: true
    } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.text.fontFamily).toBe('Inter');
    expect(arg.text.color).toBe('#fff');
    expect(arg.style).toEqual({
      textFontFamily: 'Inter',
      textColor: '#fff',
      textSize: 14,
      textBold: true
    });
  });

  it('handleTextStyleChange omits the style mirror when no mirrored key is provided', () => {
    const bag = makeBag();
    bag.handlers.handleTextStyleChange({} as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.style).toBeUndefined();
  });

  it('handleTextSecondaryLabelsChange dual-writes label* keys onto style', () => {
    const bag = makeBag();
    bag.handlers.handleTextSecondaryLabelsChange({
      fontFamily: 'Inter',
      color: '#000',
      size: 11
    } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.text.secondaryLabels.fontFamily).toBe('Inter');
    expect(arg.style).toEqual({
      labelFontFamily: 'Inter',
      labelColor: '#000',
      labelSize: 11
    });
  });

  it('handleTextModesChange renames color/size to colorMode/sizeMode', () => {
    const bag = makeBag();
    bag.handlers.handleTextModesChange({
      color: 'classes',
      size: 'proportional'
    } as never);
    const [updates, afterUpdate] =
      bag.updateSelectedVisualization.mock.calls[0];
    expect(updates.text.colorMode).toBe('classes');
    expect(updates.text.sizeMode).toBe('proportional');

    afterUpdate({ id: 'next' });
    expect(bag.ensurePrimitiveClassificationDefaults).toHaveBeenCalledWith(
      'text',
      { id: 'next' }
    );
  });

  it('handleTextModesChange snapshots the current color state when mode changes', () => {
    const bag = makeBag();
    bag.handlers.handleTextModesChange({ color: 'classes' } as never);
    const [updates] = bag.updateSelectedVisualization.mock.calls[0];
    expect(updates.text.colorMode).toBe('classes');
    expect(updates.text.colorModeStates?.unique).toMatchObject({
      color: '#abc'
    });
  });

  it('handleTextModesChange restores saved color state for a previously visited mode', () => {
    const bag = makeBag();
    (bag.visualization.text as Record<string, unknown>).colorModeStates = {
      classes: {
        valueColumn: 'my_column',
        classification: { method: 'kmeans', classes: 5 }
      }
    };
    bag.handlers.handleTextModesChange({ color: 'classes' } as never);
    const [updates] = bag.updateSelectedVisualization.mock.calls[0];
    expect(updates.text.valueColumn).toBe('my_column');
    expect(updates.text.classification).toEqual({
      method: 'kmeans',
      classes: 5
    });
  });

  it('handleTextModesChange snapshots size state and applies defaults when mode changes', () => {
    const bag = makeBag();
    bag.handlers.handleTextModesChange({ size: 'proportional' } as never);
    const [updates] = bag.updateSelectedVisualization.mock.calls[0];
    expect(updates.text.sizeMode).toBe('proportional');
    expect(updates.text.sizeModeStates?.fixed).toMatchObject({ size: 12 });
  });

  it('handleTextModesChange supports classed text-size state', () => {
    const bag = makeBag();
    bag.handlers.handleTextModesChange({ size: 'classes' } as never);
    const [updates, afterUpdate] =
      bag.updateSelectedVisualization.mock.calls[0];
    expect(updates.text.sizeMode).toBe('classes');
    expect(updates.text.valueColumn).toBeUndefined();
    expect(updates.text.classification).toBeUndefined();

    afterUpdate({ id: 'next' });
    expect(bag.ensurePrimitiveClassificationDefaults).toHaveBeenCalledWith(
      'text',
      { id: 'next' }
    );
  });

  it('handleTextModesChange does not update modeStates when mode is unchanged', () => {
    const bag = makeBag();
    bag.handlers.handleTextModesChange({ color: 'unique' } as never);
    const calls = bag.updateSelectedVisualization.mock.calls;
    if (calls.length > 0) {
      expect(calls[0][0].text.colorModeStates).toBeUndefined();
    }
  });

  it('handleTextSecondaryLabelsChange merges into secondaryLabels', () => {
    const bag = makeBag();
    bag.handlers.handleTextSecondaryLabelsChange({ enabled: true } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.text.secondaryLabels).toEqual({ enabled: true });
  });
});
