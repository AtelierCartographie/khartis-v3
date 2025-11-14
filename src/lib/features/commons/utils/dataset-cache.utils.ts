import type { DatasetResult, EnrichedColumn } from '$lib/features/pipeline';
import type { GeoColumnResult } from './geo-detector.utils';

const CACHE_COLUMN_SAMPLE_SIZE = 25;

type ColumnWithSamples = EnrichedColumn & { sampleValues?: unknown[] };

export function createDatasetCacheSnapshot(
  dataset: DatasetResult
): DatasetResult {
  const snapshotColumns = dataset.columns.map(cloneEnrichedColumn);

  const snapshot: DatasetResult = {
    ...dataset,
    data: [],
    originalData: undefined,
    columns: snapshotColumns,
    metadata: cloneMetadata(dataset.metadata),
    geometry: cloneGeometry(dataset.geometry),
    bounds: dataset.bounds ? { ...dataset.bounds } : undefined,
    analysis: dataset.analysis ? cloneAnalysis(dataset.analysis) : undefined,
    geoDetection: cloneGeoDetection(dataset.geoDetection),
    createdAt: cloneDate(dataset.createdAt)
  };

  return snapshot;
}

function cloneMetadata(
  metadata: DatasetResult['metadata']
): DatasetResult['metadata'] {
  const processedAt =
    metadata.processedAt instanceof Date
      ? metadata.processedAt
      : new Date(metadata.processedAt);

  return {
    ...metadata,
    processedAt: new Date(processedAt.getTime()),
    transformations: metadata.transformations
      ? [...metadata.transformations]
      : undefined
  };
}

function cloneGeometry(
  geometry: DatasetResult['geometry']
): DatasetResult['geometry'] {
  if (!geometry) {
    return undefined;
  }

  return {
    ...geometry,
    bounds: [...geometry.bounds] as typeof geometry.bounds,
    centroid: [...geometry.centroid] as typeof geometry.centroid
  };
}

function cloneAnalysis(
  analysis: NonNullable<DatasetResult['analysis']>
): NonNullable<DatasetResult['analysis']> {
  const columnsWithSamples = analysis.columns as ColumnWithSamples[];
  const clonedColumns = columnsWithSamples.map((column) =>
    cloneAnalysisColumn(column)
  ) as EnrichedColumn[];

  return {
    ...analysis,
    columns: clonedColumns,
    geoColumns: analysis.geoColumns
      ? analysis.geoColumns.map((column) =>
          typeof column === 'object' && column !== null
            ? { ...(column as Record<string, unknown>) }
            : column
        )
      : undefined,
    warnings: [...analysis.warnings]
  };
}

function cloneGeoDetection(
  geoDetection: DatasetResult['geoDetection']
): DatasetResult['geoDetection'] {
  if (!geoDetection) {
    return undefined;
  }

  return {
    ...geoDetection,
    geoColumns: geoDetection.geoColumns.map(cloneGeoColumn),
    suggestedPrimaryGeoColumn: geoDetection.suggestedPrimaryGeoColumn
      ? cloneGeoColumn(geoDetection.suggestedPrimaryGeoColumn)
      : undefined,
    warnings: [...geoDetection.warnings]
  };
}

function cloneGeoColumn(column: GeoColumnResult): GeoColumnResult {
  return {
    ...column,
    sampleValues: column.sampleValues
      ? column.sampleValues.slice(0, CACHE_COLUMN_SAMPLE_SIZE)
      : undefined,
    matchedPatterns: column.matchedPatterns
      ? [...column.matchedPatterns]
      : undefined
  };
}

function cloneEnrichedColumn(column: EnrichedColumn): EnrichedColumn {
  return {
    ...column,
    values: column.values?.slice(0, CACHE_COLUMN_SAMPLE_SIZE) ?? [],
    stats: { ...column.stats }
  };
}

function cloneAnalysisColumn(column: ColumnWithSamples): ColumnWithSamples {
  return {
    ...cloneEnrichedColumn(column),
    sampleValues: column.sampleValues
      ? column.sampleValues.slice(0, CACHE_COLUMN_SAMPLE_SIZE)
      : undefined
  };
}

function cloneDate(value: Date | string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime());
}
