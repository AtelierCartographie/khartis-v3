import { beforeEach, describe, expect, it } from 'vitest';
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
  });

  it('stores a metrics snapshot alongside the current view mode', () => {
    deckDebugStore.setViewMode(ViewMode.ORTHOGRAPHIC);
    deckDebugStore.setMetrics(SAMPLE_METRICS);

    expect(deckDebugStore.viewMode).toBe(ViewMode.ORTHOGRAPHIC);
    expect(deckDebugStore.metrics).toEqual(SAMPLE_METRICS);
  });

  it('clears the debug snapshot', () => {
    deckDebugStore.setViewMode(ViewMode.MAPLIBRE);
    deckDebugStore.setMetrics(null);

    deckDebugStore.clear();

    expect(deckDebugStore.viewMode).toBeNull();
    expect(deckDebugStore.metrics).toBeNull();
  });
});
