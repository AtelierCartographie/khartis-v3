import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createTextHandlers,
  type TextHandlersDeps
} from './text-handlers.svelte';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
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
  updatePrimitiveClassificationState: Mock;
  updateTextBackgroundClassificationState: Mock;
  updateTextBackgroundStrokeClassificationState: Mock;
  applyPrimitiveMappingUpdate: Mock;
  applyTextBackgroundMappingUpdate: Mock;
  applyTextBackgroundStrokeMappingUpdate: Mock;
  invertPrimitivePalette: Mock;
  invertTextBackgroundPalette: Mock;
  invertTextBackgroundStrokePalette: Mock;
  updateTextBackground: Mock;
  ensurePrimitiveClassificationDefaults: Mock;
  ensureAutoColumns: Mock;
  ensureTextBackgroundClassificationDefaults: Mock;
  ensureTextBackgroundAutoColumns: Mock;
  ensureTextBackgroundStrokeClassificationDefaults: Mock;
  ensureTextBackgroundStrokeAutoColumns: Mock;
  handlers: ReturnType<typeof createTextHandlers>;
}

function makeBag(): DepsBag {
  const text = {
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
    background: {
      fillMode: 'none',
      fillColor: '#fff',
      fillOpacity: 1,
      strokeMode: 'none',
      strokeColor: '#000',
      strokeWidth: 1,
      strokeOpacity: 1,
      strokeDashed: false
    },
    secondaryLabels: { enabled: false },
    missingData: { color: '#fff', show: true }
  };
  const visualization = { id: 'viz', text };
  const mocks = {
    updateSelectedVisualization: vi.fn(),
    updatePrimitiveClassificationState: vi.fn(),
    updateTextBackgroundClassificationState: vi.fn(),
    updateTextBackgroundStrokeClassificationState: vi.fn(),
    applyPrimitiveMappingUpdate: vi.fn(),
    applyTextBackgroundMappingUpdate: vi.fn(),
    applyTextBackgroundStrokeMappingUpdate: vi.fn(),
    invertPrimitivePalette: vi.fn(),
    invertTextBackgroundPalette: vi.fn(),
    invertTextBackgroundStrokePalette: vi.fn(),
    updateTextBackground: vi.fn(),
    ensurePrimitiveClassificationDefaults: vi.fn(),
    ensureAutoColumns: vi.fn(),
    ensureTextBackgroundClassificationDefaults: vi.fn(),
    ensureTextBackgroundAutoColumns: vi.fn(),
    ensureTextBackgroundStrokeClassificationDefaults: vi.fn(),
    ensureTextBackgroundStrokeAutoColumns: vi.fn()
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

  it('handleTextBackgroundStyleChange uses updateTextBackground updater', () => {
    const bag = makeBag();
    bag.handlers.handleTextBackgroundStyleChange({
      fillColor: '#aaa',
      fillOpacity: undefined
    } as never);
    expect(bag.updateTextBackground).toHaveBeenCalledTimes(1);
    const updaterFn = bag.updateTextBackground.mock.calls[0][0];
    const result = updaterFn({ fillColor: '#zzz', fillOpacity: 0.4 });
    expect(result).toEqual({ fillColor: '#aaa', fillOpacity: 0.4 });
  });

  it('handleTextBackgroundModesChange triggers all four ensure callbacks', () => {
    const bag = makeBag();
    bag.handlers.handleTextBackgroundModesChange({
      fill: 'classes',
      stroke: 'unique'
    } as never);
    const [, afterUpdate] = bag.updateSelectedVisualization.mock.calls[0];
    afterUpdate({ id: 'next' });
    expect(bag.ensureTextBackgroundClassificationDefaults).toHaveBeenCalled();
    expect(bag.ensureTextBackgroundAutoColumns).toHaveBeenCalled();
    expect(
      bag.ensureTextBackgroundStrokeClassificationDefaults
    ).toHaveBeenCalled();
    expect(bag.ensureTextBackgroundStrokeAutoColumns).toHaveBeenCalled();
  });

  it('handleTextSecondaryLabelsChange merges into secondaryLabels', () => {
    const bag = makeBag();
    bag.handlers.handleTextSecondaryLabelsChange({ enabled: true } as never);
    const arg = bag.updateSelectedVisualization.mock.calls[0][0];
    expect(arg.text.secondaryLabels).toEqual({ enabled: true });
  });
});
