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

  const processedDatasets = normalizeDatasets(datasetsStore.datasets);
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

  const processedDatasets = normalizeDatasets(datasetsStore.datasets);
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

  const processedDatasets = normalizeDatasets(datasetsStore.datasets);
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
