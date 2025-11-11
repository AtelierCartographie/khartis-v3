import type { AnalysisResult, ColumnInfo } from './AnalysisResult';

export interface ProcessedDataset {
  id: string;
  name: string;
  sourceFileId?: string;
  format: 'csv' | 'geojson' | 'shapefile';

  // Data
  data: Record<string, unknown>[];
  rowCount: number;

  // Analysis
  columns: ColumnInfo[];
  analysis: AnalysisResult;

  // Geometry (if applicable)
  geometry?:
    | 'Point'
    | 'LineString'
    | 'Polygon'
    | 'MultiPoint'
    | 'MultiLineString'
    | 'MultiPolygon';
  bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };

  // DuckDB
  duckdbTableName?: string;

  // Metadata
  createdAt: Date;
  fileSize: number;
  metadata: {
    processedAt: Date;
    transformations: string[];
  };
  originalData?: {
    columns: ColumnInfo[];
    data: Record<string, unknown>[];
    rowCount: number;
  };
}
