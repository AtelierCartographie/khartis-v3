export type MapExportFormat = 'svg' | 'jpg';
export type DataExportFormat = 'csv' | 'geojson' | 'csv-geo';
export type ExportResolution = '1080p' | '2k' | '4k';

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

export const RESOLUTION_DIMENSIONS: Record<
  ExportResolution,
  { width: number; height: number }
> = {
  '1080p': { width: 1920, height: 1080 },
  '2k': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 }
};
