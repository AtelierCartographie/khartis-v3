export type ColumnType = 'number' | 'string' | 'date' | 'boolean' | 'geometry';

export interface ParsedData {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  format: 'csv' | 'geojson' | 'shapefile';
}

export interface GeoJSONParsedData extends ParsedData {
  format: 'geojson';
  features: GeoJSON.FeatureCollection;
}

export interface CSVParsedData extends ParsedData {
  format: 'csv';
}
