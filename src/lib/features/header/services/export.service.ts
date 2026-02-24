import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import {
  exportProcessedDatasets,
  downloadFile,
  generateExportFilename
} from '$lib/features/commons/utils/file-export.utils';
import {
  exportMapToSvg,
  exportMapToJpg,
  exportMapToPng
} from '$lib/features/commons/utils/map-export.utils';
import { getAnnotationsState } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
import { getLegendState } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import { normalizeDatasets } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { m } from '$lib/paraglide/messages.js';
import { DATA_FORMAT, type DataExportFormat } from '../types';
import { Duck, duckDBOrchestrator } from '$lib/features/duckdb';
import type { ProcessedDataset } from '$lib/features/data-pipeline/types';
import {
  COLUMN_TYPE_GEOMETRY,
  INTERNAL_COLUMN
} from '$lib/features/commons/constants/data.constants';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';

export interface ExportError extends Error {
  title: string;
}

interface ExportErrorConstructor {
  new (title: string, message: string): ExportError;
  readonly prototype: ExportError;
}

export const ExportError: ExportErrorConstructor = function ExportError(
  this: ExportError,
  title: string,
  message: string
): ExportError {
  const error = new Error(message) as ExportError;
  Object.setPrototypeOf(error, ExportError.prototype);
  error.name = 'ExportError';
  error.title = title;
  Error.captureStackTrace?.(error, ExportError);
  return error;
} as unknown as ExportErrorConstructor;

Object.setPrototypeOf(ExportError.prototype, Error.prototype);

export async function exportProject(fileName: string): Promise<void> {
  if (!projectStore.currentProject) {
    logger.warn('No project to export', LogCategory.EXPORT);
    return;
  }

  await projectStore.exportProject(fileName);
  logger.info('Project exported', LogCategory.EXPORT, { fileName });
}

export async function exportMapAsSvg(fileName: string): Promise<void> {
  validateMapExportPrerequisites();
  logger.info('Starting SVG export', LogCategory.EXPORT, {
    datasetCount: datasetsStore.datasets.length,
    visualizationCount: visualizationStore.activeVisualizations.length
  });

  const normalizedDatasets = normalizeDatasets(datasetsStore.datasets);

  const processedDatasets = await fetchDatasetsWithGeometry(normalizedDatasets);

  const annotations = getAnnotationsState();
  const legend = getLegendState();

  const blob = exportMapToSvg(
    processedDatasets,
    visualizationStore.activeVisualizations,
    {},
    annotations,
    legend
  );
  const filename = generateExportFilename(fileName, 'svg');

  downloadFile(blob, filename);
  logger.info('SVG export completed', LogCategory.EXPORT, { filename });
}

export async function exportMapAsJpg(
  fileName: string,
  width: number = 1920,
  height: number = 1080
): Promise<void> {
  validateMapExportPrerequisites();

  const normalizedDatasets = normalizeDatasets(datasetsStore.datasets);
  const processedDatasets = await fetchDatasetsWithGeometry(normalizedDatasets);
  const annotations = getAnnotationsState();
  const legend = getLegendState();

  const blob = await exportMapToJpg(
    processedDatasets,
    visualizationStore.activeVisualizations,
    { width, height },
    annotations,
    legend
  );
  const filename = generateExportFilename(fileName, 'jpg');

  downloadFile(blob, filename);
  logger.info('JPG export completed', LogCategory.EXPORT, {
    filename,
    width,
    height
  });
}

export async function exportMapAsPng(
  fileName: string,
  width: number = 1920,
  height: number = 1080
): Promise<void> {
  validateMapExportPrerequisites();

  const normalizedDatasets = normalizeDatasets(datasetsStore.datasets);
  const processedDatasets = await fetchDatasetsWithGeometry(normalizedDatasets);
  const annotations = getAnnotationsState();
  const legend = getLegendState();

  const blob = await exportMapToPng(
    processedDatasets,
    visualizationStore.activeVisualizations,
    { width, height },
    annotations,
    legend
  );
  const filename = generateExportFilename(fileName, 'png');

  downloadFile(blob, filename);
  logger.info('PNG export completed', LogCategory.EXPORT, {
    filename,
    width,
    height
  });
}

export async function exportData(
  fileName: string,
  format: DataExportFormat
): Promise<void> {
  if (datasetsStore.datasets.length === 0) {
    throw new ExportError(m.export_data_error(), m.export_data_no_data());
  }

  const formatConfig = getDataFormatConfig(format);
  const normalizedDatasets = normalizeDatasets(datasetsStore.datasets);
  const blob = await exportProcessedDatasets(
    normalizedDatasets,
    formatConfig.format
  );
  const filename = generateExportFilename(fileName, formatConfig.extension);

  downloadFile(blob, filename);
  logger.info('Data export completed', LogCategory.EXPORT, {
    filename,
    format
  });
}

function validateMapExportPrerequisites(): void {
  if (!mapInstanceStore.isMapLoaded) {
    throw new ExportError(m.export_map_error(), m.export_map_not_loaded());
  }

  if (datasetsStore.datasets.length === 0) {
    throw new ExportError(m.export_map_error(), m.export_map_no_data());
  }
}

function getDataFormatConfig(format: DataExportFormat): {
  format: DataExportFormat;
  extension: string;
} {
  switch (format) {
    case DATA_FORMAT.CSV:
      return { format: DATA_FORMAT.CSV, extension: DATA_FORMAT.CSV };
    case DATA_FORMAT.GEOJSON:
      return { format: DATA_FORMAT.GEOJSON, extension: DATA_FORMAT.GEOJSON };
    case DATA_FORMAT.CSV_GEO:
      return { format: DATA_FORMAT.CSV_GEO, extension: DATA_FORMAT.CSV };
  }
}

async function fetchJoinedDatasetWithGeometry(
  dataset: ProcessedDataset,
  joinedBasemapId: string
): Promise<ProcessedDataset> {
  const { basemapService } =
    await import('$lib/features/map/services/basemap.service.svelte');
  const geometryTable =
    await basemapService.loadGeometryIntoDuckDB(joinedBasemapId);

  const geomColumns = (await Duck.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(geometryTable)}'
     AND column_name NOT IN ('${INTERNAL_COLUMN.GEOM}', '${INTERNAL_COLUMN.GEOMETRY}', '${INTERNAL_COLUMN.WKB_GEOMETRY}', '${INTERNAL_COLUMN.THE_GEOM}')
     AND data_type IN ('VARCHAR', 'TEXT')`,
    { format: 'array' }
  )) as Array<{ column_name: string }>;

  const colList = geomColumns
    .map((c) => `"${escapeIdentifier(c.column_name)}"`)
    .join(', ');
  const escapedDataset = escapeIdentifier(dataset.duckdbTableName!);
  const escapedGeometry = escapeIdentifier(geometryTable);
  const viewName = `export_joined_${dataset.duckdbTableName!.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  await Duck.query(`
    CREATE OR REPLACE TEMP VIEW "${viewName}" AS
    WITH geom_unpivot AS (
      UNPIVOT "${escapedGeometry}"
      ON ${colList}
      INTO NAME _attr_col VALUE _attr_val
    )
    SELECT d.*, ST_AsGeoJSON(gu.geom) AS geom
    FROM "${escapedDataset}" d
    INNER JOIN (
      SELECT DISTINCT _attr_val, geom
      FROM geom_unpivot
    ) gu
    ON CAST(d.basemap_id AS VARCHAR) = CAST(gu._attr_val AS VARCHAR)
    WHERE gu.geom IS NOT NULL
  `);

  const rows = (await Duck.query(`SELECT * FROM "${viewName}"`, {
    format: 'array'
  })) as Record<string, unknown>[];

  // DuckDB Arrow rows have non-enumerable properties — must copy by explicit column name
  const allColumnNames = [
    ...dataset.columns.map((c) => c.name),
    INTERNAL_COLUMN.GEOM
  ];

  const dataWithParsedGeometry = rows.map((row) => {
    const newRow: Record<string, unknown> = {};
    for (const colName of allColumnNames) {
      newRow[colName] = row[colName];
    }
    const geomValue = newRow[INTERNAL_COLUMN.GEOM];
    if (typeof geomValue === 'string') {
      try {
        newRow[INTERNAL_COLUMN.GEOM] = JSON.parse(geomValue);
      } catch {
        newRow[INTERNAL_COLUMN.GEOM] = null;
      }
    }
    return newRow;
  });

  return {
    ...dataset,
    geometry: 'Polygon',
    data: dataWithParsedGeometry,
    columns: [
      ...dataset.columns,
      {
        name: INTERNAL_COLUMN.GEOM,
        type: COLUMN_TYPE_GEOMETRY,
        label: INTERNAL_COLUMN.GEOM,
        originalType: 'GEOMETRY',
        nullable: true,
        unique: false
      } as (typeof dataset.columns)[0]
    ]
  };
}

async function fetchDatasetsWithGeometry(
  datasets: ProcessedDataset[]
): Promise<ProcessedDataset[]> {
  const results: ProcessedDataset[] = [];

  for (const dataset of datasets) {
    if (!dataset.duckdbTableName || !dataset.geometry) {
      // Check if this is a joined dataset (CSV joined to a basemap)
      if (dataset.sourceFileId) {
        const duckDataset = duckDBOrchestrator.getDatasetBySourceFile(
          dataset.sourceFileId
        );
        if (duckDataset?.joinedBasemap) {
          try {
            const joinedDataset = await fetchJoinedDatasetWithGeometry(
              dataset,
              duckDataset.joinedBasemap
            );
            results.push(joinedDataset);
          } catch (error) {
            logger.error(
              'Failed to fetch joined geometry for export',
              LogCategory.EXPORT,
              {
                datasetId: dataset.id,
                joinedBasemap: duckDataset.joinedBasemap,
                error: error instanceof Error ? error.message : String(error)
              }
            );
            results.push(dataset);
          }
          continue;
        }
      }

      logger.warn(
        'Skipping geometry hydration for dataset without table/geometry',
        LogCategory.EXPORT,
        {
          id: dataset.id,
          hasDuckdbTableName: !!dataset.duckdbTableName,
          hasGeometry: !!dataset.geometry
        }
      );
      results.push(dataset);
      continue;
    }

    const geomColumn = dataset.columns.find(
      (col) => col.type === COLUMN_TYPE_GEOMETRY
    );
    if (!geomColumn) {
      logger.warn(
        'Skipping geometry hydration for dataset without geometry column',
        LogCategory.EXPORT,
        {
          id: dataset.id
        }
      );
      results.push(dataset);
      continue;
    }

    try {
      const query = `SELECT * REPLACE (ST_AsGeoJSON("${geomColumn.name}") AS "${geomColumn.name}")
         FROM "${dataset.duckdbTableName}"`;

      const rows = (await Duck.query(query, { format: 'array' })) as Record<
        string,
        unknown
      >[];

      const columnNames = dataset.columns.map((c) => c.name);
      const dataWithParsedGeometry = rows.map((row) => {
        const newRow: Record<string, unknown> = {};
        for (const colName of columnNames) {
          newRow[colName] = row[colName];
        }
        const geomValue = newRow[geomColumn.name];
        if (typeof geomValue === 'string') {
          try {
            newRow[geomColumn.name] = JSON.parse(geomValue);
          } catch {
            newRow[geomColumn.name] = null;
          }
        }
        return newRow;
      });

      results.push({
        ...dataset,
        data: dataWithParsedGeometry
      });
    } catch (error) {
      logger.error(
        'Failed to fetch geometry data from DuckDB',
        LogCategory.EXPORT,
        {
          datasetId: dataset.id,
          tableName: dataset.duckdbTableName,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      results.push(dataset);
    }
  }

  logger.info('Datasets prepared for export', LogCategory.EXPORT, {
    requested: datasets.length,
    prepared: results.length
  });

  return results;
}
