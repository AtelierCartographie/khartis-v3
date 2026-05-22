import { Matrix4 } from '@math.gl/core';
import type { ProjectionLike } from 'geoarrow-deck-stream';
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
    fitPaddingPx: DEFAULT_FIT_PADDING_PX,
    renderScale: 1,
    modelMatrix: null,
    renderProjection: null,
    isProjectedCoordinates: false
  });
  let needsCanvasFit = true;

  function recalculateModelMatrix(): void {
    const {
      referenceBbox,
      referenceGeoMetadata,
      canvasSize,
      fitPaddingPx,
      isProjectedCoordinates
    } = state;

    if (referenceGeoMetadata) {
      state.modelMatrix = get_model_matrix(
        referenceGeoMetadata,
        canvasSize,
        undefined,
        fitPaddingPx
      );
      return;
    }

    if (referenceBbox) {
      state.modelMatrix = get_model_matrix_from_bbox(
        referenceBbox,
        canvasSize,
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
      needsCanvasFit = true;
      recalculateModelMatrix();
    }
  }

  function setReferenceBbox(
    bbox: BBox,
    geoMetadata?: string,

    isProjected = false
  ): void {
    state.referenceBbox = bbox;
    state.referenceGeoMetadata = geoMetadata ?? null;
    state.isProjectedCoordinates = isProjected;
    needsCanvasFit = true;
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
    if (needsCanvasFit) {
      recalculateModelMatrix();
      needsCanvasFit = false;
    }
  }

  function refitToCanvas(): void {
    needsCanvasFit = true;
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
    needsCanvasFit = true;
    recalculateModelMatrix();
  }

  function setRenderScale(renderScale: number): void {
    const nextRenderScale =
      Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;

    state.renderScale = nextRenderScale;
  }

  function setRenderProjection(projection: ProjectionLike | null): void {
    state.renderProjection = projection;
  }

  function clear(): void {
    state.referenceBbox = null;
    state.referenceGeoMetadata = null;
    state.modelMatrix = null;
    state.renderProjection = null;
    state.fitPaddingPx = DEFAULT_FIT_PADDING_PX;
    state.renderScale = 1;
    state.isProjectedCoordinates = false;
    needsCanvasFit = true;
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
    needsCanvasFit = true;
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
    refitToCanvas,
    setFitPadding,
    setRenderScale,
    setRenderProjection,
    clear,
    reset
  };
}

export const projectionStore = createProjectionStore();
