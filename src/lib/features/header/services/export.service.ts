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

export class ExportError extends Error {
  constructor(
    public title: string,
    message: string
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

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

  logger.info('[EXPORT DEBUG] Starting SVG export', LogCategory.EXPORT, {
    rawDatasetCount: datasetsStore.datasets.length,
    rawDatasets: datasetsStore.datasets.map((d) => ({
      id: d.id,
      name: d.name,
      tableName: d.tableName,
      geometryType: d.geometry?.type,
      columnCount: d.columns.length
    }))
  });

  const normalizedDatasets = normalizeDatasets(datasetsStore.datasets);

  logger.info('[EXPORT DEBUG] Normalized datasets', LogCategory.EXPORT, {
    normalizedCount: normalizedDatasets.length,
    datasets: normalizedDatasets.map((d) => ({
      id: d.id,
      name: d.name,
      duckdbTableName: d.duckdbTableName,
      geometry: d.geometry,
      dataLength: d.data?.length ?? 0
    }))
  });

  const processedDatasets = await fetchDatasetsWithGeometry(normalizedDatasets);

  logger.info('[EXPORT DEBUG] After geometry fetch', LogCategory.EXPORT, {
    processedCount: processedDatasets.length,
    datasets: processedDatasets.map((d) => ({
      id: d.id,
      dataLength: d.data.length
    }))
  });

  logger.info('[EXPORT DEBUG] Active visualizations', LogCategory.EXPORT, {
    count: visualizationStore.activeVisualizations.length,
    visualizations: visualizationStore.activeVisualizations.map((v) => ({
      id: v.id,
      name: v.name,
      datasetId: v.datasetId,
      type: v.type,
      enabled: v.enabled
    }))
  });

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

  logger.info(
    '[EXPORT DEBUG] fetchDatasetsWithGeometry called',
    LogCategory.EXPORT,
    {
      datasetCount: datasets.length,
      datasetIds: datasets.map((d) => d.id),
      datasetNames: datasets.map((d) => d.name)
    }
  );

  for (const dataset of datasets) {
    logger.info('[EXPORT DEBUG] Processing dataset', LogCategory.EXPORT, {
      id: dataset.id,
      name: dataset.name,
      duckdbTableName: dataset.duckdbTableName,
      geometry: dataset.geometry,
      columnCount: dataset.columns.length,
      columnTypes: dataset.columns.map((c) => ({ name: c.name, type: c.type })),
      existingDataLength: dataset.data?.length ?? 0
    });

    if (!dataset.duckdbTableName || !dataset.geometry) {
      logger.warn(
        '[EXPORT DEBUG] Skipping dataset - no tableName or geometry',
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
        '[EXPORT DEBUG] Skipping dataset - no geometry column found',
        LogCategory.EXPORT,
        {
          id: dataset.id,
          columnTypes: dataset.columns.map((c) => c.type)
        }
      );
      results.push(dataset);
      continue;
    }

    logger.info('[EXPORT DEBUG] Found geometry column', LogCategory.EXPORT, {
      id: dataset.id,
      geomColumnName: geomColumn.name,
      geomColumnType: geomColumn.type
    });

    try {
      const query = `SELECT * REPLACE (ST_AsGeoJSON("${geomColumn.name}") AS "${geomColumn.name}")
         FROM "${dataset.duckdbTableName}"`;
      logger.info('[EXPORT DEBUG] Executing DuckDB query', LogCategory.EXPORT, {
        query
      });

      const rows = (await Duck.query(query, { format: 'array' })) as Record<
        string,
        unknown
      >[];

      logger.info('[EXPORT DEBUG] DuckDB query returned', LogCategory.EXPORT, {
        rowCount: rows.length,
        sampleRow: rows[0] ? Object.keys(rows[0]) : [],
        firstGeomValue:
          rows[0] && geomColumn.name in rows[0]
            ? String(rows[0][geomColumn.name]).substring(0, 100)
            : 'N/A'
      });

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

      logger.info('[EXPORT DEBUG] Parsed geometry data', LogCategory.EXPORT, {
        parsedRowCount: dataWithParsedGeometry.length,
        firstParsedGeom: dataWithParsedGeometry[0]
          ? typeof dataWithParsedGeometry[0][geomColumn.name]
          : 'N/A'
      });

      results.push({
        ...dataset,
        data: dataWithParsedGeometry
      });
    } catch (error) {
      logger.error(
        '[EXPORT DEBUG] Failed to fetch geometry data from DuckDB',
        LogCategory.EXPORT,
        {
          tableName: dataset.duckdbTableName,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        }
      );
      results.push(dataset);
    }
  }

  logger.info(
    '[EXPORT DEBUG] fetchDatasetsWithGeometry completed',
    LogCategory.EXPORT,
    {
      resultCount: results.length,
      resultsWithData: results.filter((d) => d.data.length > 0).length
    }
  );

  return results;
}
