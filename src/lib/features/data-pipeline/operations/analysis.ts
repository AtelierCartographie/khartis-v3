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
      stdDev: column.stddev ? Number(column.stddev) : undefined
    }
  }));
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

  const duckdbColumns = (await Duck.analyse(
    tableName
  )) as DuckAnalyticsColumn[];
  const rowCount = await Duck.get_row_count(tableName);
  const geometryInfo = await extractGeometryInfo(tableName);
  const enrichedColumns = enrichColumns(duckdbColumns);

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
              columnName: geometryInfo.type ? 'geom' : '',
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
