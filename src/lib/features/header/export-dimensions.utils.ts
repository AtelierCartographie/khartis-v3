import {
  EXPORT_RESOLUTION_LONG_EDGE_PX,
  type ExportDimensions,
  type ExportResolution
} from './types';

function normalizeDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.round(value));
}

export function getExportDimensionsForPage(
  pageWidth: number,
  pageHeight: number,
  resolution: ExportResolution
): ExportDimensions {
  const safeWidth = normalizeDimension(pageWidth);
  const safeHeight = normalizeDimension(pageHeight);
  const sourceLongEdge = Math.max(safeWidth, safeHeight);
  const targetLongEdge = EXPORT_RESOLUTION_LONG_EDGE_PX[resolution];
  const scale = targetLongEdge / sourceLongEdge;

  return {
    width: normalizeDimension(safeWidth * scale),
    height: normalizeDimension(safeHeight * scale)
  };
}

export function formatExportDimensions({
  width,
  height
}: ExportDimensions): string {
  return `${width} × ${height} px`;
}
