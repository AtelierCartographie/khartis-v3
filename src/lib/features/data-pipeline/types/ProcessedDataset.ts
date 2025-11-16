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

  data: Record<string, unknown>[];
  rowCount: number;

  columns: ColumnInfo[];
  analysis: AnalysisResult;

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

  duckdbTableName?: string;

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
