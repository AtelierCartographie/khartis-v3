import type { AnalysisResult, ColumnInfo } from './AnalysisResult';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';

export interface ProcessedDataset {
  id: string;
  name: string;
  sourceFileId?: string;
  format:
    | 'csv'
    | 'geojson'
    | 'shapefile'
    | 'geopackage'
    | 'geoparquet'
    | 'kml'
    | 'kmz'
    | 'unknown';

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
  geoDetection?: GeoDetectionResult;
  originalData?: {
    columns: ColumnInfo[];
    data: Record<string, unknown>[];
    rowCount: number;
  };
}
