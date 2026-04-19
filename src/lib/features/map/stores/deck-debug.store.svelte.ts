import { ViewMode } from '../constants/map.constants';

interface CanvasSize {
  width: number;
  height: number;
}

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
  renderPixelRatio: number;
  canvasSize: CanvasSize | null;
  lastUpdatedAt: number | null;
}

const DEFAULT_RENDER_PIXEL_RATIO = 1;

function normalizeRenderPixelRatio(pixelRatio: number): number {
  return Number.isFinite(pixelRatio) && pixelRatio > 0
    ? pixelRatio
    : DEFAULT_RENDER_PIXEL_RATIO;
}

function normalizeCanvasSize(size: CanvasSize | null): CanvasSize | null {
  if (!size) {
    return null;
  }

  const width = Number.isFinite(size.width) ? Math.round(size.width) : 0;
  const height = Number.isFinite(size.height) ? Math.round(size.height) : 0;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function createDeckDebugStore() {
  const state = $state<DeckDebugState>({
    metrics: null,
    viewMode: null,
    renderPixelRatio: DEFAULT_RENDER_PIXEL_RATIO,
    canvasSize: null,
    lastUpdatedAt: null
  });

  function setViewMode(viewMode: ViewMode | null): void {
    state.viewMode = viewMode;
  }

  function setRenderPixelRatio(pixelRatio: number): void {
    state.renderPixelRatio = normalizeRenderPixelRatio(pixelRatio);
  }

  function setCanvasSize(size: CanvasSize | null): void {
    state.canvasSize = normalizeCanvasSize(size);
  }

  function setMetrics(metrics: DeckDebugMetrics | null): void {
    state.metrics = metrics ? { ...metrics } : null;
    state.lastUpdatedAt = metrics ? Date.now() : null;
  }

  function clear(): void {
    state.metrics = null;
    state.viewMode = null;
    state.renderPixelRatio = DEFAULT_RENDER_PIXEL_RATIO;
    state.canvasSize = null;
    state.lastUpdatedAt = null;
  }

  return {
    get metrics(): DeckDebugMetrics | null {
      return state.metrics;
    },
    get viewMode(): ViewMode | null {
      return state.viewMode;
    },
    get renderPixelRatio(): number {
      return state.renderPixelRatio;
    },
    get canvasSize(): CanvasSize | null {
      return state.canvasSize;
    },
    get lastUpdatedAt(): number | null {
      return state.lastUpdatedAt;
    },
    setViewMode,
    setRenderPixelRatio,
    setCanvasSize,
    setMetrics,
    clear
  };
}

export const deckDebugStore = createDeckDebugStore();
