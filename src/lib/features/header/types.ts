export type MapExportFormat = 'svg' | 'jpg';
export type DataExportFormat = 'csv' | 'geojson' | 'csv-geo';

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
