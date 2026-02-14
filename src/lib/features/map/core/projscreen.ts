import { Matrix4 } from '@math.gl/core';
import type { CanvasSize } from '../types';

const FIT_BOUNDS_PADDING_FACTOR = 0.92;

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
  bbox: [number, number, number, number]
): number {
  const bbox_width = bbox[2] - bbox[0];
  const bbox_height = bbox[3] - bbox[1];

  if (bbox_width === 0 || bbox_height === 0) return 1;

  const scale_x = canvas.width / bbox_width;
  const scale_y = canvas.height / bbox_height;

  return Math.min(scale_x, scale_y) * FIT_BOUNDS_PADDING_FACTOR;
}

export function get_model_matrix(
  metadata: string,
  canvasSize: CanvasSize,
  columnName?: string
): Matrix4 | null {
  const bbox = get_bbox_from_geoparquet(metadata, columnName);
  if (!bbox) return null;

  return get_model_matrix_from_bbox(bbox, canvasSize);
}

export function get_model_matrix_from_bbox(
  bbox: [number, number, number, number],
  canvasSize: CanvasSize
): Matrix4 {
  const [cx, cy] = get_bbox_center(bbox);
  const scale = get_max_scale(canvasSize, bbox);

  return new Matrix4().scale([scale, scale, 1]).translate([-cx, -cy, 0]);
}
