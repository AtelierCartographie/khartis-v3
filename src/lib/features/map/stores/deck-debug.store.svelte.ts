import { ViewMode } from '../constants/map.constants';

export interface DeckDebugMetrics {
  fps: number;
  setPropsTime: number;
  layersCount: number;
  drawLayersCount: number;
  updateLayersCount: number;
  updateAttributesTime: number;
  updateAttributesCount: number;
  framesRedrawn: number;
  pickTime: number;
  pickCount: number;
  pickLayersCount: number;
  gpuTime: number;
  gpuTimePerFrame: number;
  cpuTime: number;
  cpuTimePerFrame: number;
  bufferMemory: number;
  textureMemory: number;
  renderbufferMemory: number;
  gpuMemory: number;
}

interface DeckDebugState {
  metrics: DeckDebugMetrics | null;
  viewMode: ViewMode | null;
}

function createDeckDebugStore() {
  const state = $state<DeckDebugState>({
    metrics: null,
    viewMode: null
  });

  function setViewMode(viewMode: ViewMode | null): void {
    state.viewMode = viewMode;
  }

  function setMetrics(metrics: DeckDebugMetrics | null): void {
    state.metrics = metrics ? { ...metrics } : null;
  }

  function clear(): void {
    state.metrics = null;
    state.viewMode = null;
  }

  return {
    get metrics(): DeckDebugMetrics | null {
      return state.metrics;
    },
    get viewMode(): ViewMode | null {
      return state.viewMode;
    },
    setViewMode,
    setMetrics,
    clear
  };
}

export const deckDebugStore = createDeckDebugStore();
