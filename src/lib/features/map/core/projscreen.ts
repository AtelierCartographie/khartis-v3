import { Matrix4 } from '@math.gl/core';
import type { CanvasSize } from '../types';

interface GeoParquetColumnMeta {
  bbox: [number, number, number, number];
  geometry_types?: string[];
}

interface GeoParquetMeta {
  primary_column: string;
  columns: Record<string, GeoParquetColumnMeta>;
}

export function get_bbox_from_geoparquet(
  metadata: string,
  columnName?: string
): [number, number, number, number] | null {
  try {
    const meta: GeoParquetMeta = JSON.parse(metadata);
    const column = columnName ?? meta.primary_column;
    return meta.columns[column]?.bbox ?? null;
  } catch {
    return null;
  }
}

export function get_bbox_center(
  bbox: [number, number, number, number]
): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

export function get_max_scale(
  canvas: CanvasSize,
  bbox: [number, number, number, number],
  fitPaddingPx = 0
): number {
  const bbox_width = bbox[2] - bbox[0];
  const bbox_height = bbox[3] - bbox[1];

  if (bbox_width === 0 || bbox_height === 0) return 1;

  const safePadding = Math.max(0, Math.round(fitPaddingPx));
  const usableWidth = Math.max(1, canvas.width - safePadding * 2);
  const usableHeight = Math.max(1, canvas.height - safePadding * 2);
  const scale_x = usableWidth / bbox_width;
  const scale_y = usableHeight / bbox_height;

  return Math.min(scale_x, scale_y);
}

export function get_model_matrix(
  metadata: string,
  canvasSize: CanvasSize,
  columnName?: string,
  fitPaddingPx = 0
): Matrix4 | null {
  const bbox = get_bbox_from_geoparquet(metadata, columnName);
  if (!bbox) return null;

  return get_model_matrix_from_bbox(bbox, canvasSize, false, fitPaddingPx);
}

export function get_model_matrix_from_bbox(
  bbox: [number, number, number, number],
  canvasSize: CanvasSize,
  /** Negate Y scale for d3-geo projected coordinates (Y-down convention) */
  flipY = false,
  fitPaddingPx = 0
): Matrix4 {
  const [cx, cy] = get_bbox_center(bbox);
  const scale = get_max_scale(canvasSize, bbox, fitPaddingPx);
  const yScale = flipY ? -scale : scale;

  return new Matrix4().scale([scale, yScale, 1]).translate([-cx, -cy, 0]);
}
