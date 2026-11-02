import { get_max_scale } from '../core/projscreen';
import type { BBox } from '../types';

export interface MapFrameInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ResolveFittedMapFrameOptions {
  page: { width: number; height: number };
  margins: MapFrameInsets;
  /** Extent the automatic fit centres and scales into the frame. */
  referenceBbox: BBox | null;
  /** Extent of what is drawn, in the same units; null when it is the reference. */
  drawnBbox: BBox | null;
  fitPaddingPx: number;
  minFrameSize: number;
}

function hasArea(bbox: BBox | null): bbox is BBox {
  return (
    bbox !== null &&
    bbox.every(Number.isFinite) &&
    bbox[2] > bbox[0] &&
    bbox[3] > bbox[1]
  );
}

function fitAxis(
  available: number,
  halfExtent: number,
  minSize: number
): number {
  const size = Math.min(
    available,
    Math.max(Math.ceil(2 * halfExtent), Math.min(minSize, available))
  );
  return Math.max(0, Math.floor((available - size) / 2));
}

/**
 * Frame of an automatically fitted orthographic map: the fit centres the
 * reference in the area the margins leave, so the frame keeps, around that
 * centre, the part the drawn map reaches plus the fit padding. The frame is
 * symmetric, which leaves the fit centred and its scale unchanged once the
 * map is refitted to it.
 */
export function resolveFittedMapFrame({
  page,
  margins,
  referenceBbox,
  drawnBbox,
  fitPaddingPx,
  minFrameSize
}: ResolveFittedMapFrameOptions): MapFrameInsets {
  const width = page.width - margins.left - margins.right;
  const height = page.height - margins.top - margins.bottom;
  if (!hasArea(referenceBbox) || width <= 0 || height <= 0) {
    return { ...margins };
  }

  const extent: BBox = hasArea(drawnBbox)
    ? [
        Math.min(drawnBbox[0], referenceBbox[0]),
        Math.min(drawnBbox[1], referenceBbox[1]),
        Math.max(drawnBbox[2], referenceBbox[2]),
        Math.max(drawnBbox[3], referenceBbox[3])
      ]
    : referenceBbox;
  const scale = get_max_scale({ width, height }, referenceBbox, fitPaddingPx);
  const padding = Math.max(0, Math.round(fitPaddingPx));
  const centerX = (referenceBbox[0] + referenceBbox[2]) / 2;
  const centerY = (referenceBbox[1] + referenceBbox[3]) / 2;
  const halfWidth =
    Math.max(centerX - extent[0], extent[2] - centerX) * scale + padding;
  const halfHeight =
    Math.max(centerY - extent[1], extent[3] - centerY) * scale + padding;
  const insetX = fitAxis(width, halfWidth, minFrameSize);
  const insetY = fitAxis(height, halfHeight, minFrameSize);

  return {
    top: margins.top + insetY,
    right: margins.right + insetX,
    bottom: margins.bottom + insetY,
    left: margins.left + insetX
  };
}
