import type {
  GeoColumnResult,
  GeoDetectionResult
} from '$lib/features/commons/utils/geo-detector.utils';
import type {
  ColumnInfo,
  ColumnStats,
  DatasetResult,
  EnrichedColumn,
  GeoColumnInfo,
  ProcessedDataset,
  ProcessedDatasetAnalysisResult
} from '../types';
import { ColumnType, isNumericType } from '../types';

type DatasetLike = DatasetResult | ProcessedDataset;

const KNOWN_FORMATS = [
  'csv',
  'geojson',
  'shapefile',
  'geopackage',
  'geoparquet',
  'kml',
  'kmz'
] as const satisfies ProcessedDataset['format'][];

const COLUMN_TYPE_ALIASES = new Map<string, ColumnInfo['type']>([
  [ColumnType.NUMBER, 'number'],
  ['int', 'number'],
  ['integer', 'number'],
  ['double', 'number'],
  ['float', 'number'],
  [ColumnType.DATE, 'date'],
  ['timestamp', 'date'],
  [ColumnType.BOOLEAN, 'boolean'],
  ['bool', 'boolean'],
  [ColumnType.GEOMETRY, 'geometry'],
  [ColumnType.TEXT, 'string'],
  ['string', 'string']
]);

function isProcessedDataset(dataset: DatasetLike): dataset is ProcessedDataset {
  return (
    Array.isArray(dataset.columns) &&
    dataset.columns.length > 0 &&
    'nullable' in dataset.columns[0]
  );
}

function mapFormat(format?: string): ProcessedDataset['format'] {
  if (format) {
    const normalized = format.toLowerCase();
    if ((KNOWN_FORMATS as readonly string[]).includes(normalized)) {
      return normalized as ProcessedDataset['format'];
    }
  }
  return 'csv';
}

function mapColumnType(
  type?: ColumnType | ColumnInfo['type'] | string
): ColumnInfo['type'] {
  if (!type) return 'string';

  const normalized = String(type).toLowerCase();
  return COLUMN_TYPE_ALIASES.get(normalized) ?? 'string';
}

function buildColumnInfo(column: EnrichedColumn): ColumnInfo {
  const stats = column.stats as ColumnStats | undefined;
  const nullable =
    (stats?.nulls ?? 0) > 0 || column.values.some((value) => value === null);
  const unique =
    stats?.uniques !== undefined &&
    stats?.count !== undefined &&
    stats.count > 0 &&
    stats.uniques === stats.count;

  return {
    name: column.name,
    type: mapColumnType(column.type ?? stats?.type),
    nullable,
    unique,
    min: stats?.min as number | string | Date | undefined,
    max: stats?.max as number | string | Date | undefined,
    mean: isNumericType(stats?.type ?? ColumnType.TEXT)
      ? stats?.mean
      : undefined,
    sampleValues: column.values?.slice(0, 5)
  };
}

function mapGeoColumnResult(
  column?: GeoColumnResult
): GeoColumnInfo | undefined {
  if (!column) return undefined;
  return {
    index: column.index,
    columnName: column.columnName,
    type: (column.type as GeoColumnInfo['type']) ?? 'unknown',
    confidence: column.confidence ?? 0
  };
}

function mapGeoColumns(detection?: GeoDetectionResult): {
  geoColumns: GeoColumnInfo[];
  suggested?: GeoColumnInfo;
} {
  if (!detection) {
    return { geoColumns: [], suggested: undefined };
  }

  const geoColumns =
    detection.geoColumns?.map((col) => mapGeoColumnResult(col)) ?? [];

  return {
    geoColumns: geoColumns.filter((col): col is GeoColumnInfo =>
      Boolean(col?.columnName)
    ),
    suggested: mapGeoColumnResult(detection.suggestedPrimaryGeoColumn)
  };
}

type LegacyGeoColumnCandidate = Partial<GeoColumnInfo> & { name?: string };

function isLegacyGeoColumnCandidate(
  value: unknown
): value is LegacyGeoColumnCandidate {
  return typeof value === 'object' && value !== null;
}

function mapLegacyGeoColumns(columns?: unknown[]): GeoColumnInfo[] {
  if (!columns) return [];
  return columns
    .map((col, index) => {
      if (!isLegacyGeoColumnCandidate(col)) {
        return undefined;
      }

      const columnName = col.columnName ?? col.name ?? '';
      if (!columnName) {
        return undefined;
      }

      return {
        index: typeof col.index === 'number' ? col.index : index,
        columnName,
        type: (col.type as GeoColumnInfo['type']) ?? 'unknown',
        confidence: Number(col.confidence ?? 0)
      };
    })
    .filter((col): col is GeoColumnInfo => Boolean(col));
}

function buildAnalysis(
  dataset: DatasetResult,
  columns: ColumnInfo[]
): ProcessedDatasetAnalysisResult {
  const { geoColumns, suggested } = mapGeoColumns(dataset.geoDetection);

  const legacyGeoColumns =
    geoColumns.length > 0
      ? geoColumns
      : mapLegacyGeoColumns(dataset.analysis?.geoColumns);

  const suggestedFromLegacy =
    suggested ??
    legacyGeoColumns.find(
      (col) => col.columnName === dataset.analysis?.suggestedGeoColumn
    );

  return {
    columns:
      dataset.analysis?.columns?.map(buildColumnInfo) ??
      columns.map((col) => ({ ...col })),
    geoColumns: legacyGeoColumns,
    hasGeoData:
      dataset.geoDetection?.hasGeoColumns ??
      dataset.analysis?.hasGeoData ??
      false,
    suggestedGeoColumn: suggestedFromLegacy?.columnName,
    rowCount: dataset.analysis?.rowCount ?? dataset.rowCount,
    warnings: [
      ...(dataset.analysis?.warnings ?? []),
      ...(dataset.geoDetection?.warnings ?? [])
    ]
  };
}

export function normalizeToProcessedDataset(
  dataset: DatasetLike
): ProcessedDataset {
  if (isProcessedDataset(dataset)) {
    return dataset;
  }

  const columns = dataset.columns.map(buildColumnInfo);
  const createdAt =
    dataset.createdAt ?? dataset.metadata?.processedAt ?? new Date();
  const metadataProcessedAt =
    dataset.metadata?.processedAt ?? dataset.createdAt ?? new Date();
  const metadataTransformations = dataset.metadata?.transformations ?? [];

  const analysis = buildAnalysis(dataset, columns);

  return {
    id: dataset.id,
    name: dataset.name,
    sourceFileId: dataset.sourceFileId,
    format: mapFormat(dataset.format ?? dataset.metadata?.fileType),
    data: dataset.data ?? [],
    rowCount: dataset.rowCount,
    columns,
    analysis,
    geometry: dataset.geometry?.type as ProcessedDataset['geometry'],
    bounds: dataset.bounds,
    duckdbTableName: dataset.tableName,
    createdAt,
    fileSize: dataset.fileSize ?? 0,
    metadata: {
      processedAt: metadataProcessedAt,
      transformations: metadataTransformations
    },
    geoDetection: dataset.geoDetection,
    originalData: dataset.originalData
      ? {
          columns: dataset.originalData.columns.map(buildColumnInfo),
          data: dataset.originalData.data,
          rowCount: dataset.originalData.rowCount
        }
      : undefined
  };
}

export function normalizeDatasets(datasets: DatasetLike[]): ProcessedDataset[] {
  return datasets.map((dataset) => normalizeToProcessedDataset(dataset));
}
