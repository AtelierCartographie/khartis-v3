import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const THUMBNAIL_MAX_WIDTH = 320;
const THUMBNAIL_MAX_HEIGHT = 240;
const THUMBNAIL_JPEG_QUALITY = 0.6;
const MAP_CANVAS_SELECTOR = '.map-canvas canvas, .shared-facets-canvas canvas';

export interface MapThumbnail {
  dataUrl: string;
  width: number;
  height: number;
}

/** Resolve the live map canvas; blank-frame detection handles non-preserved Deck buffers. */
function resolveMapCanvas(): HTMLCanvasElement | null {
  const mapLibreCanvas = mapInstanceStore.getMapCanvas();
  if (mapLibreCanvas) {
    return mapLibreCanvas;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const domCanvas = document.querySelector(MAP_CANVAS_SELECTOR);
  return domCanvas instanceof HTMLCanvasElement ? domCanvas : null;
}

function computeThumbnailSize(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  const ratio = Math.min(
    THUMBNAIL_MAX_WIDTH / sourceWidth,
    THUMBNAIL_MAX_HEIGHT / sourceHeight,
    1
  );

  return {
    width: Math.max(1, Math.round(sourceWidth * ratio)),
    height: Math.max(1, Math.round(sourceHeight * ratio))
  };
}

/** Detect transparent readback from non-preserved WebGL buffers. */
function isBlankFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  try {
    const { data } = context.getImageData(0, 0, width, height);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Capture a best-effort low-resolution map preview without forcing a redraw. */
export function captureMapThumbnail(): MapThumbnail | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const sourceCanvas = resolveMapCanvas();
  if (!sourceCanvas || sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
    return null;
  }

  try {
    const { width, height } = computeThumbnailSize(
      sourceCanvas.width,
      sourceCanvas.height
    );
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;

    const context = target.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }

    context.drawImage(sourceCanvas, 0, 0, width, height);

    if (isBlankFrame(context, width, height)) {
      return null;
    }

    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    const dataUrl = target.toDataURL('image/jpeg', THUMBNAIL_JPEG_QUALITY);
    if (!dataUrl || dataUrl === 'data:,') {
      return null;
    }

    return { dataUrl, width, height };
  } catch (error) {
    logger.warn('Failed to capture map thumbnail', LogCategory.PROJECT, error);
    return null;
  }
}
