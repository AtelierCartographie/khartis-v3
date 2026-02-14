import { Matrix4 } from '@math.gl/core';
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
  modelMatrix: Matrix4 | null;
}

const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 800, height: 600 };

function createProjectionStore() {
  const state = $state<ProjectionState>({
    referenceBbox: null,
    referenceGeoMetadata: null,
    canvasSize: DEFAULT_CANVAS_SIZE,
    modelMatrix: null
  });

  function recalculateModelMatrix(): void {
    const { referenceBbox, referenceGeoMetadata, canvasSize } = state;

    if (referenceGeoMetadata) {
      state.modelMatrix = get_model_matrix(referenceGeoMetadata, canvasSize);
      return;
    }

    if (referenceBbox) {
      state.modelMatrix = get_model_matrix_from_bbox(referenceBbox, canvasSize);
      return;
    }

    state.modelMatrix = null;
  }

  function setReferenceBboxFromMetadata(geoMetadata: string): void {
    const bbox = get_bbox_from_geoparquet(geoMetadata);
    if (bbox) {
      state.referenceBbox = bbox;
      state.referenceGeoMetadata = geoMetadata;
      recalculateModelMatrix();
    }
  }

  function setReferenceBbox(bbox: BBox, geoMetadata?: string): void {
    state.referenceBbox = bbox;
    state.referenceGeoMetadata = geoMetadata ?? null;
    recalculateModelMatrix();
  }

  function updateCanvasSize(size: CanvasSize): void {
    if (
      size.width !== state.canvasSize.width ||
      size.height !== state.canvasSize.height
    ) {
      state.canvasSize = size;
      recalculateModelMatrix();
    }
  }

  function clear(): void {
    state.referenceBbox = null;
    state.referenceGeoMetadata = null;
    state.modelMatrix = null;
  }

  function reset(): void {
    state.referenceBbox = null;
    state.referenceGeoMetadata = null;
    state.canvasSize = DEFAULT_CANVAS_SIZE;
    state.modelMatrix = null;
  }

  return {
    get referenceBbox(): BBox | null {
      return state.referenceBbox;
    },
    get modelMatrix(): Matrix4 | null {
      return state.modelMatrix;
    },
    get canvasSize(): CanvasSize {
      return state.canvasSize;
    },
    get hasProjection(): boolean {
      return state.modelMatrix !== null;
    },
    setReferenceBboxFromMetadata,
    setReferenceBbox,
    updateCanvasSize,
    clear,
    reset
  };
}

export const projectionStore = createProjectionStore();
