export type MapExportFormat = 'svg' | 'jpg';
export type DataExportFormat = 'csv' | 'geojson' | 'csv-geo';
export type ExportResolution = '1080p' | '2k' | '4k';

export interface ExportDimensions {
  width: number;
  height: number;
}

export const ExportTab = {
  PROJECT: 0,
  MAP: 1,
  DATA: 2
} as const;

export type ExportTabType = (typeof ExportTab)[keyof typeof ExportTab];

export const MAP_FORMAT = {
  SVG: 'svg',
  JPG: 'jpg'
} as const;

export const DATA_FORMAT = {
  CSV: 'csv',
  GEOJSON: 'geojson',
  CSV_GEO: 'csv-geo'
} as const;

export const EXPORT_RESOLUTION = {
  HD_1080P: '1080p',
  QHD_2K: '2k',
  UHD_4K: '4k'
} as const;

export const EXPORT_RESOLUTION_LONG_EDGE_PX: Record<ExportResolution, number> =
  {
    '1080p': 1920,
    '2k': 2560,
    '4k': 3840
  };

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

export interface UseExportModalReturn {
  readonly isOpen: boolean;
  readonly isExporting: boolean;
  readonly selectedTab: ExportTabType;
  readonly fileName: string;
  readonly mapFormat: MapExportFormat;
  readonly dataFormat: DataExportFormat;
  readonly resolution: ExportResolution;

  open: () => void;
  close: () => void;
  setTab: (tab: ExportTabType) => void;
  setFileName: (name: string) => void;
  setMapFormat: (format: MapExportFormat) => void;
  setDataFormat: (format: DataExportFormat) => void;
  setResolution: (resolution: ExportResolution) => void;
  executeExport: () => Promise<void>;
}
