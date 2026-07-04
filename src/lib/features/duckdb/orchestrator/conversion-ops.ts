import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { ArrowTableLike, DuckDBDataset } from '../types';
import * as datasetState from './dataset-state';

export interface GetTableDataFn {
  (tableName: string, options?: { limit?: number }): Promise<ArrowTableLike>;
}

export async function convertToProcessedDataset(
  duckDataset: DuckDBDataset,
  getTableData: GetTableDataFn
): Promise<ProcessedDataset> {
  let data: Record<string, unknown>[] = [];
  try {
    const tableData = await getTableData(duckDataset.tableName, {
      limit: 1000
    });

    if (tableData && tableData.numRows > 0) {
      const limit = Math.min(1000, tableData.numRows);
      for (let i = 0; i < limit; i++) {
        const row = tableData.get(i);
        const cleanRow: Record<string, unknown> = {};
        for (const key in row) {
          if (!key.startsWith('__')) {
            cleanRow[key] = row[key];
          }
        }
        data.push(cleanRow);
      }
    }
  } catch (error) {
    logger.error(
      'Failed to convert DuckDB table data to processed dataset rows',
      LogCategory.DUCKDB,
      error
    );
    data = [];
  }

  const userColumns = duckDataset.columns.filter(
    (col) => !col.name.startsWith('__')
  );

  const mappedGeoColumns = datasetState.mapGeoColumnsForAnalysis(
    duckDataset.geoDetection?.geoColumns
  );
  const mappedSuggestedGeoColumn = duckDataset.geoDetection
    ?.suggestedPrimaryGeoColumn
    ? datasetState.mapGeoColumnResult(
        duckDataset.geoDetection.suggestedPrimaryGeoColumn
      )
    : undefined;

  const processedDataset = {
    id: duckDataset.id,
    name: duckDataset.name,
    sourceFileId: duckDataset.sourceFileId,
    format: 'csv' as const,
    columns: userColumns.map((col) => ({
      name: col.name,
      type: datasetState.mapDuckDBType(
        String(col.type_simple || col.type || col.type_js)
      ),
      nullable: (Number(col.nulls) || 0) > 0,
      unique: Boolean(col.unique),
      min: typeof col.min === 'bigint' ? Number(col.min) : col.min,
      max: typeof col.max === 'bigint' ? Number(col.max) : col.max,
      uniqueValues: col.unique ? new Set() : undefined,
      sampleValues: []
    })),
    rowCount: duckDataset.rowCount,
    data: data,
    analysis: {
      columns: userColumns.map((col) => ({
        name: col.name,
        type: datasetState.mapDuckDBType(
          String(col.type_simple || col.type || col.type_js)
        ),
        nullable: (Number(col.nulls) || 0) > 0,
        unique: Boolean(col.unique),
        min: typeof col.min === 'bigint' ? Number(col.min) : col.min,
        max: typeof col.max === 'bigint' ? Number(col.max) : col.max,
        sampleValues: []
      })),
      geoColumns: mappedGeoColumns,
      hasGeoData: duckDataset.geoDetection?.hasGeoColumns ?? false,
      suggestedGeoColumn: mappedSuggestedGeoColumn?.columnName,
      rowCount: duckDataset.rowCount,
      warnings: duckDataset.geoDetection?.warnings ?? []
    },
    createdAt: duckDataset.metadata.processedAt,
    fileSize: 0,
    metadata: {
      processedAt: duckDataset.metadata.processedAt,
      transformations: []
    },
    geoDetection: duckDataset.geoDetection
  };

  return processedDataset;
}
