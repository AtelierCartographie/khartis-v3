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

/**
 * Resolve the live map canvas. MapLibre is created with
 * `preserveDrawingBuffer: true` (`use-map-init`), so reading its pixels is
 * reliable. The standalone Deck.gl orthographic context has no preserved
 * drawing buffer, so a direct read returns an empty canvas — handled by the
 * blank-frame guard in {@link captureMapThumbnail}.
 */
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

/**
 * A WebGL context without a preserved drawing buffer reads back as fully
 * transparent. Detect that case so callers can fall back to a placeholder
 * instead of persisting a blank thumbnail.
 */
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

/**
 * Capture a low-resolution preview of the current map for the project gallery.
 *
 * Best-effort and non-blocking by design: it reads the already-rendered canvas
 * without mutating the DOM, changing the device pixel ratio, or forcing a
 * redraw, so it never introduces a frame stutter. Returns `null` when no
 * readable frame is available (e.g. orthographic Deck.gl), letting the gallery
 * fall back to its placeholder.
 */
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
