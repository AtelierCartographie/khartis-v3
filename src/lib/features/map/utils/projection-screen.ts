import { Matrix4 } from '@math.gl/core';

type BoundingBox = [number, number, number, number];
type CanvasSize = [number, number];
type Point = [number, number];

interface GeoParquetMetadata {
  primary_column: string;
  columns: Record<string, { bbox: BoundingBox }>;
}

export function getModelMatrix(
  metadata: string,
  canvasSize: CanvasSize
): Matrix4 {
  const bbox = getBboxFromGeoparquet(metadata);
  const [bboxCx, bboxCy] = getBboxCenter(bbox);
  const maxScale = getMaxScale(canvasSize, bbox);
  const modelMatrix = getMatrix(maxScale, -bboxCx, -bboxCy);

  return modelMatrix;
}

function getMatrix(scale: number, tx: number, ty: number): Matrix4 {
  return new Matrix4().scale([scale, scale, 0]).translate([tx, ty, 0]);
}

function getBboxCenter(bbox: BoundingBox): Point {
  const [xMin, yMin, xMax, yMax] = bbox;
  const x = (xMax + xMin) / 2;
  const y = (yMax + yMin) / 2;
  return [x, y];
}

function getMaxScale(size: CanvasSize, bbox: BoundingBox): number {
  const x = size[0] / (bbox[2] - bbox[0]);
  const y = size[1] / (bbox[3] - bbox[1]);

  return Math.min(x, y);
}

function getBboxFromGeoparquet(metadata: string): BoundingBox {
  const json: GeoParquetMetadata = JSON.parse(metadata);
  const geoColumn = json.primary_column;
  const bbox = json.columns[geoColumn].bbox;
  return bbox;
}
