import { Duck } from '$lib/features/duckdb';
import type {
  DatasetResult,
  DuckAnalyticsColumn,
  EnrichedColumn,
  FileFormat,
  FileInfo,
  GeometryInfo,
  PipelineContext
} from '../types';
import { fromDuckDBType } from '../types';
import { extractGeometryInfo } from './geometry';
import { computeQualityWarnings } from './quality';

export interface DatasetTableSnapshot {
  duckColumns: DuckAnalyticsColumn[];
  enrichedColumns: EnrichedColumn[];
  rowCount: number;
}

export function enrichColumns(
  columns: DuckAnalyticsColumn[]
): EnrichedColumn[] {
  return columns.map((column) => ({
    name: column.name,
    values: [],
    type: fromDuckDBType(String(column.type_simple || 'text')),
    stats: {
      name: column.name,
      type: fromDuckDBType(String(column.type_simple || 'text')),
      count: Number(column.count || 0),
      nulls: Number(column.nulls || 0),
      uniques: Number(column.uniques || 0),
      min: column.min,
      max: column.max,
      mean: column.mean ? Number(column.mean) : undefined,
      median: column.median ? Number(column.median) : undefined,
      stdDev: column.stddev ? Number(column.stddev) : undefined,
      share_integers:
        column.share_integers != null
          ? Number(column.share_integers)
          : undefined,
      share_floats:
        column.share_floats != null ? Number(column.share_floats) : undefined,
      share_rank_interval:
        column.share_rank_interval != null
          ? Number(column.share_rank_interval)
          : undefined,
      extent_magnitude:
        column.extent_magnitude != null
          ? Number(column.extent_magnitude)
          : undefined
    }
  }));
}

export function buildStatisticsSnapshot(
  columns: DuckAnalyticsColumn[]
): Record<string, unknown> {
  return Object.fromEntries(
    columns.map((column) => [
      column.name,
      {
        type: column.type_simple || 'text',
        count: column.count ?? 0,
        nullCount: column.nulls ?? 0,
        unique: column.uniques ?? 0,
        min: column.min,
        max: column.max,
        mean:
          column.mean != null && column.mean !== ''
            ? Number(column.mean)
            : undefined
      }
    ])
  );
}

export async function readDatasetTableSnapshot(
  tableName: string,
  options: { force?: boolean } = {}
): Promise<DatasetTableSnapshot> {
  const [duckColumns, rowCount] = await Promise.all([
    Duck.analyse(tableName, options) as Promise<DuckAnalyticsColumn[]>,
    Duck.get_row_count(tableName)
  ]);

  return {
    duckColumns,
    enrichedColumns: enrichColumns(duckColumns),
    rowCount
  };
}

export async function buildDatasetFromDuckTable(
  _ctx: PipelineContext,
  params: {
    file: FileInfo;
    tableName: string;
    isGeoFile: boolean;
    format: FileFormat;
  }
): Promise<DatasetResult> {
  const { file, tableName, isGeoFile, format } = params;

  const [snapshot, geometryInfo] = await Promise.all([
    readDatasetTableSnapshot(tableName),
    extractGeometryInfo(tableName)
  ]);
  const { enrichedColumns, rowCount } = snapshot;

  const dataset = buildDatasetResult({
    file,
    tableName,
    enrichedColumns,
    rowCount,
    isGeoFile,
    geometryInfo,
    format
  });

  const qualityWarnings = computeQualityWarnings(enrichedColumns, rowCount);
  if (dataset.analysis) {
    dataset.analysis.warnings = [
      ...(dataset.analysis.warnings ?? []),
      ...qualityWarnings
    ];
  }

  return dataset;
}

function buildDatasetResult(params: {
  file: FileInfo;
  tableName: string;
  enrichedColumns: EnrichedColumn[];
  rowCount: number;
  isGeoFile: boolean;
  geometryInfo?: GeometryInfo;
  format: FileFormat;
}): DatasetResult {
  const {
    file,
    tableName,
    enrichedColumns,
    rowCount,
    isGeoFile,
    geometryInfo,
    format
  } = params;
  const datasetId = crypto.randomUUID();

  return {
    id: datasetId,
    name: file.name,
    sourceFileId: file.name,
    tableName,
    columns: enrichedColumns,
    rowCount,
    geometry: geometryInfo,
    metadata: {
      processedAt: new Date(),
      fileType: format,
      parserUsed: 'DuckDB',
      processingDuration: undefined,
      transformations: []
    },
    data: [],
    format,
    analysis: {
      columns: enrichedColumns,
      hasGeoData: Boolean(geometryInfo || isGeoFile),
      geoColumns: geometryInfo
        ? [
            {
              columnName: geometryInfo.columnName ?? 'geom',
              type: 'unknown' as const,
              confidence: 1,
              index: 0,
              isValid: true
            }
          ]
        : [],
      rowCount,
      warnings: []
    },
    fileSize: file.size,
    bounds: geometryInfo?.bounds
      ? {
          minLon: geometryInfo.bounds[0],
          minLat: geometryInfo.bounds[1],
          maxLon: geometryInfo.bounds[2],
          maxLat: geometryInfo.bounds[3]
        }
      : undefined,
    createdAt: new Date()
  };
}
