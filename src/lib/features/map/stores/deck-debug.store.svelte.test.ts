import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewMode } from '../constants/map.constants';
import { deckDebugStore } from './deck-debug.store.svelte';

const SAMPLE_METRICS = {
  fps: 58.4,
  setPropsTime: 3.1,
  layersCount: 7,
  drawLayersCount: 5,
  updateLayersCount: 2,
  updateAttributesTime: 4.2,
  updateAttributesCount: 3,
  framesRedrawn: 60,
  pickTime: 1.7,
  pickCount: 4,
  pickLayersCount: 2,
  gpuTime: 16.5,
  gpuTimePerFrame: 0.28,
  cpuTime: 34.2,
  cpuTimePerFrame: 0.57,
  bufferMemory: 1024,
  textureMemory: 2048,
  renderbufferMemory: 4096,
  gpuMemory: 7168
};

describe('deck debug store', () => {
  beforeEach(() => {
    deckDebugStore.clear();
    vi.restoreAllMocks();
  });

  it('stores a metrics snapshot alongside the current rendering context', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1713427200000);

    deckDebugStore.setViewMode(ViewMode.ORTHOGRAPHIC);
    deckDebugStore.setRenderPixelRatio(2);
    deckDebugStore.setCanvasSize({ width: 1279.6, height: 719.8 });
    deckDebugStore.setMetrics(SAMPLE_METRICS);

    expect(deckDebugStore.viewMode).toBe(ViewMode.ORTHOGRAPHIC);
    expect(deckDebugStore.renderPixelRatio).toBe(2);
    expect(deckDebugStore.canvasSize).toEqual({ width: 1280, height: 720 });
    expect(deckDebugStore.metrics).toEqual(SAMPLE_METRICS);
    expect(deckDebugStore.lastUpdatedAt).toBe(1713427200000);
  });

  it('normalizes invalid inputs and clears the debug snapshot', () => {
    deckDebugStore.setViewMode(ViewMode.MAPLIBRE);
    deckDebugStore.setRenderPixelRatio(Number.NaN);
    deckDebugStore.setCanvasSize({ width: -1, height: 0 });
    deckDebugStore.setMetrics(null);

    expect(deckDebugStore.renderPixelRatio).toBe(1);
    expect(deckDebugStore.canvasSize).toBeNull();
    expect(deckDebugStore.lastUpdatedAt).toBeNull();

    deckDebugStore.clear();

    expect(deckDebugStore.viewMode).toBeNull();
    expect(deckDebugStore.metrics).toBeNull();
    expect(deckDebugStore.canvasSize).toBeNull();
    expect(deckDebugStore.renderPixelRatio).toBe(1);
  });
});
