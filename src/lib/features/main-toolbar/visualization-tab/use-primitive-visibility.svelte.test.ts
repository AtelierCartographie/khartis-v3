import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
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

vi.mock('$lib/features/main-toolbar/constants', () => ({
  DEFAULT_COLORS: { fill: '#aaa', gray: '#888' },
  FillMode: { NONE: 'none', UNIQUE: 'unique' },
  VISUALIZATION_DEFAULTS: {
    textOpacity: 100,
    symbolOpacity: 90,
    lineOpacity: 80,
    fillOpacity: 70
  }
}));

import { usePrimitiveVisibility } from './use-primitive-visibility.svelte';

describe('usePrimitiveVisibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleTextVisibilityChange calls handleTextChange with restored opacity when previously hidden', () => {
    const handleTextChange = vi.fn();
    const viz = { text: { opacity: 0 } } as never;
    const { handleTextVisibilityChange } = usePrimitiveVisibility({
      getSelectedVisualization: () => viz,
      handleSymbolChange: vi.fn(),
      handleLineChange: vi.fn(),
      handlePolygonChange: vi.fn(),
      handleTextChange
    });
    handleTextVisibilityChange(true);
    expect(handleTextChange).toHaveBeenCalledWith({
      enabled: true,
      opacity: 1
    });
  });

  it('handleTextVisibilityChange preserves opacity when already visible', () => {
    const handleTextChange = vi.fn();
    const viz = { text: { opacity: 0.5 } } as never;
    const { handleTextVisibilityChange } = usePrimitiveVisibility({
      getSelectedVisualization: () => viz,
      handleSymbolChange: vi.fn(),
      handleLineChange: vi.fn(),
      handlePolygonChange: vi.fn(),
      handleTextChange
    });
    handleTextVisibilityChange(true);
    expect(handleTextChange).toHaveBeenCalledWith({
      enabled: true,
      opacity: 0.5
    });
  });

  it('handleTextVisibilityChange does nothing when no text primitive', () => {
    const handleTextChange = vi.fn();
    const { handleTextVisibilityChange } = usePrimitiveVisibility({
      getSelectedVisualization: () => ({}) as never,
      handleSymbolChange: vi.fn(),
      handleLineChange: vi.fn(),
      handlePolygonChange: vi.fn(),
      handleTextChange
    });
    handleTextVisibilityChange(true);
    expect(handleTextChange).not.toHaveBeenCalled();
  });

  it('handlePrimitiveVisibilityChange POINT calls handleSymbolChange with restored colors', () => {
    const handleSymbolChange = vi.fn();
    const viz = {
      symbol: { enabled: false, opacity: 0, fillColor: undefined }
    } as never;
    const { handlePrimitiveVisibilityChange } = usePrimitiveVisibility({
      getSelectedVisualization: () => viz,
      handleSymbolChange,
      handleLineChange: vi.fn(),
      handlePolygonChange: vi.fn(),
      handleTextChange: vi.fn()
    });
    handlePrimitiveVisibilityChange('point' as never, true);
    expect(handleSymbolChange).toHaveBeenCalledWith({
      enabled: true,
      opacity: 0.9,
      fillColor: '#aaa',
      strokeColor: '#888'
    });
  });

  it('handlePrimitiveVisibilityChange POINT preserves category color palettes when re-enabled', () => {
    const handleSymbolChange = vi.fn();
    const viz = {
      symbol: {
        enabled: false,
        opacity: 0.5,
        fillColor: ['#111111', '#222222'],
        strokeColor: ['#333333', '#444444']
      }
    } as never;
    const { handlePrimitiveVisibilityChange } = usePrimitiveVisibility({
      getSelectedVisualization: () => viz,
      handleSymbolChange,
      handleLineChange: vi.fn(),
      handlePolygonChange: vi.fn(),
      handleTextChange: vi.fn()
    });
    handlePrimitiveVisibilityChange('point' as never, true);
    expect(handleSymbolChange).toHaveBeenCalledWith({
      enabled: true,
      opacity: 0.5,
      fillColor: ['#111111', '#222222'],
      strokeColor: ['#333333', '#444444']
    });
  });

  it('handlePrimitiveVisibilityChange POINT skips when state matches', () => {
    const handleSymbolChange = vi.fn();
    const viz = { symbol: { enabled: true } } as never;
    const { handlePrimitiveVisibilityChange } = usePrimitiveVisibility({
      getSelectedVisualization: () => viz,
      handleSymbolChange,
      handleLineChange: vi.fn(),
      handlePolygonChange: vi.fn(),
      handleTextChange: vi.fn()
    });
    handlePrimitiveVisibilityChange('point' as never, true);
    expect(handleSymbolChange).not.toHaveBeenCalled();
  });

  it('handlePrimitiveVisibilityChange LINE calls handleLineChange with restored color', () => {
    const handleLineChange = vi.fn();
    const viz = {
      line: { enabled: false, opacity: 0, color: undefined }
    } as never;
    const { handlePrimitiveVisibilityChange } = usePrimitiveVisibility({
      getSelectedVisualization: () => viz,
      handleSymbolChange: vi.fn(),
      handleLineChange,
      handlePolygonChange: vi.fn(),
      handleTextChange: vi.fn()
    });
    handlePrimitiveVisibilityChange('line' as never, true);
    expect(handleLineChange).toHaveBeenCalledWith({
      enabled: true,
      opacity: 0.8,
      color: '#888'
    });
  });

  it('handlePrimitiveVisibilityChange POLYGON calls handlePolygonChange with restored fillOpacity', () => {
    const handlePolygonChange = vi.fn();
    const viz = {
      polygon: {
        enabled: false,
        fillMode: 'unique',
        fillOpacity: 0,
        strokeColor: undefined
      }
    } as never;
    const { handlePrimitiveVisibilityChange } = usePrimitiveVisibility({
      getSelectedVisualization: () => viz,
      handleSymbolChange: vi.fn(),
      handleLineChange: vi.fn(),
      handlePolygonChange,
      handleTextChange: vi.fn()
    });
    handlePrimitiveVisibilityChange('polygon' as never, true);
    expect(handlePolygonChange).toHaveBeenCalledWith({
      enabled: true,
      fillOpacity: 0.7,
      strokeColor: '#888'
    });
  });
});
