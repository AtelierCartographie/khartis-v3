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

class ProjectionStore {
  private _state = $state<ProjectionState>({
    referenceBbox: null,
    referenceGeoMetadata: null,
    canvasSize: DEFAULT_CANVAS_SIZE,
    modelMatrix: null
  });

  get referenceBbox(): BBox | null {
    return this._state.referenceBbox;
  }

  get modelMatrix(): Matrix4 | null {
    return this._state.modelMatrix;
  }

  get canvasSize(): CanvasSize {
    return this._state.canvasSize;
  }

  get hasProjection(): boolean {
    return this._state.modelMatrix !== null;
  }

  setReferenceBboxFromMetadata(geoMetadata: string): void {
    const bbox = get_bbox_from_geoparquet(geoMetadata);
    if (bbox) {
      this._state.referenceBbox = bbox;
      this._state.referenceGeoMetadata = geoMetadata;
      this.recalculateModelMatrix();
    }
  }

  setReferenceBbox(bbox: BBox, geoMetadata?: string): void {
    this._state.referenceBbox = bbox;
    this._state.referenceGeoMetadata = geoMetadata ?? null;
    this.recalculateModelMatrix();
  }

  updateCanvasSize(size: CanvasSize): void {
    if (
      size.width !== this._state.canvasSize.width ||
      size.height !== this._state.canvasSize.height
    ) {
      this._state.canvasSize = size;
      this.recalculateModelMatrix();
    }
  }

  private recalculateModelMatrix(): void {
    const { referenceBbox, referenceGeoMetadata, canvasSize } = this._state;

    if (referenceGeoMetadata) {
      this._state.modelMatrix = get_model_matrix(
        referenceGeoMetadata,
        canvasSize
      );
    } else if (referenceBbox) {
      this._state.modelMatrix = get_model_matrix_from_bbox(
        referenceBbox,
        canvasSize
      );
    } else {
      this._state.modelMatrix = null;
    }
  }

  clear(): void {
    this._state.referenceBbox = null;
    this._state.referenceGeoMetadata = null;
    this._state.modelMatrix = null;
  }

  reset(): void {
    this._state = {
      referenceBbox: null,
      referenceGeoMetadata: null,
      canvasSize: DEFAULT_CANVAS_SIZE,
      modelMatrix: null
    };
  }
}

export const projectionStore = new ProjectionStore();
