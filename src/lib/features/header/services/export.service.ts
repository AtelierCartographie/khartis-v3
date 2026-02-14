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
import type { DataExportFormat } from '../types';
import { Duck } from '$lib/features/duckdb';
import type { ProcessedDataset } from '$lib/features/data-pipeline/types';

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
  format: 'csv' | 'geojson' | 'json' | 'csv-geo';
  extension: string;
} {
  switch (format) {
    case 'csv':
      return { format: 'csv', extension: 'csv' };
    case 'geojson':
      return { format: 'geojson', extension: 'geojson' };
    case 'csv-geo':
      return { format: 'csv-geo', extension: 'csv' };
  }
}

async function fetchDatasetsWithGeometry(
  datasets: ProcessedDataset[]
): Promise<ProcessedDataset[]> {
  const results: ProcessedDataset[] = [];

  for (const dataset of datasets) {
    if (!dataset.duckdbTableName || !dataset.geometry) {
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

    const geomColumn = dataset.columns.find((col) => col.type === 'geometry');
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
