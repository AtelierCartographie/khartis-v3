import { Matrix4 } from '@math.gl/core';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import {
  get_bbox_from_geoparquet,
  get_model_matrix,
  get_model_matrix_from_bbox
} from '../core/projscreen';
import type { BBox, CanvasSize } from '../types';

interface ProjectionState {
  referenceBbox: BBox | null;
  referenceGeoMetadata: string | null;
  canvasSize: CanvasSize;
  // The size the reference projection, the layer projections and the model
  // matrix are all fitted to. It stays put while the canvas is resized by a
  // crop or a page change, so geometry keeps its scale; only an explicit refit
  // moves it, together with the reference.
  fitSize: CanvasSize | null;
  fitPaddingPx: number;
  renderScale: number;
  modelMatrix: Matrix4 | null;
  renderProjection: ProjectionLike | null;

  isProjectedCoordinates: boolean;
}

const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 800, height: 600 };
const DEFAULT_FIT_PADDING_PX = 40;

function createProjectionStore() {
  const state = $state<ProjectionState>({
    referenceBbox: null,
    referenceGeoMetadata: null,
    canvasSize: DEFAULT_CANVAS_SIZE,
    fitSize: null,
    fitPaddingPx: DEFAULT_FIT_PADDING_PX,
    renderScale: 1,
    modelMatrix: null,
    renderProjection: null,
    isProjectedCoordinates: false
  });

  function getFitSize(): CanvasSize {
    return state.fitSize ?? state.canvasSize;
  }

  function recalculateModelMatrix(): void {
    const { referenceBbox, referenceGeoMetadata, fitPaddingPx } = state;
    const { isProjectedCoordinates } = state;
    const fitSize = getFitSize();

    if (referenceGeoMetadata) {
      state.modelMatrix = get_model_matrix(
        referenceGeoMetadata,
        fitSize,
        undefined,
        fitPaddingPx
      );
      return;
    }

    if (referenceBbox) {
      state.modelMatrix = get_model_matrix_from_bbox(
        referenceBbox,
        fitSize,
        isProjectedCoordinates,
        fitPaddingPx
      );
      return;
    }

    state.modelMatrix = null;
  }

  function setReferenceBboxFromMetadata(geoMetadata: string): void {
    const bbox = get_bbox_from_geoparquet(geoMetadata);
    if (bbox) {
      state.referenceBbox = bbox;
      state.referenceGeoMetadata = geoMetadata;
      state.isProjectedCoordinates = false;
      // Geographic reference (raw lng/lat): no d3 projection drives it.
      state.renderProjection = null;
      recalculateModelMatrix();
    }
  }

  function setReferenceBbox(
    bbox: BBox,
    geoMetadata?: string,

    isProjected = false,
    renderProjection?: ProjectionLike | null
  ): void {
    state.referenceBbox = bbox;
    state.referenceGeoMetadata = geoMetadata ?? null;
    state.isProjectedCoordinates = isProjected;
    // The render projection MUST stay paired with the bbox it produced: both
    // live in the same pixel space, and the scale bar inverts bbox-derived
    // samples through this projection. Setting them together here is the only
    // way to guarantee they never drift to different fits.
    if (renderProjection !== undefined) {
      state.renderProjection = renderProjection;
    }
    recalculateModelMatrix();
  }

  function updateCanvasSize(size: CanvasSize): void {
    if (
      size.width === state.canvasSize.width &&
      size.height === state.canvasSize.height
    ) {
      return;
    }

    state.canvasSize = size;
    if (state.fitSize === null) {
      state.fitSize = size;
      recalculateModelMatrix();
    }
  }

  /** Refits to `size`; the caller refreshes the reference right after. */
  function setFitSize(size: CanvasSize): void {
    const current = getFitSize();
    if (size.width === current.width && size.height === current.height) {
      return;
    }

    state.fitSize = size;
    recalculateModelMatrix();
  }

  function setFitPadding(fitPaddingPx: number): void {
    const nextFitPaddingPx =
      Number.isFinite(fitPaddingPx) && fitPaddingPx >= 0
        ? Math.round(fitPaddingPx)
        : DEFAULT_FIT_PADDING_PX;

    if (nextFitPaddingPx === state.fitPaddingPx) {
      return;
    }

    state.fitPaddingPx = nextFitPaddingPx;
    recalculateModelMatrix();
  }

  function setRenderScale(renderScale: number): void {
    const nextRenderScale =
      Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;

    state.renderScale = nextRenderScale;
  }

  function clear(): void {
    state.referenceBbox = null;
    state.referenceGeoMetadata = null;
    state.modelMatrix = null;
    state.renderProjection = null;
    state.fitPaddingPx = DEFAULT_FIT_PADDING_PX;
    state.renderScale = 1;
    state.isProjectedCoordinates = false;
    state.fitSize = null;
  }

  function reset(): void {
    state.referenceBbox = null;
    state.referenceGeoMetadata = null;
    state.canvasSize = DEFAULT_CANVAS_SIZE;
    state.modelMatrix = null;
    state.renderProjection = null;
    state.fitPaddingPx = DEFAULT_FIT_PADDING_PX;
    state.renderScale = 1;
    state.isProjectedCoordinates = false;
    state.fitSize = null;
  }

  return {
    get referenceBbox(): BBox | null {
      return state.referenceBbox;
    },
    get isProjectedCoordinates(): boolean {
      return state.isProjectedCoordinates;
    },
    get modelMatrix(): Matrix4 | null {
      return state.modelMatrix;
    },
    get renderProjection(): ProjectionLike | null {
      return state.renderProjection;
    },
    get canvasSize(): CanvasSize {
      return state.canvasSize;
    },
    get fitSize(): CanvasSize {
      return getFitSize();
    },
    get fitPaddingPx(): number {
      return state.fitPaddingPx;
    },
    get renderScale(): number {
      return state.renderScale;
    },
    get hasProjection(): boolean {
      return state.modelMatrix !== null;
    },
    setReferenceBboxFromMetadata,
    setReferenceBbox,
    updateCanvasSize,
    setFitSize,
    setFitPadding,
    setRenderScale,
    clear,
    reset
  };
}

export const projectionStore = createProjectionStore();
