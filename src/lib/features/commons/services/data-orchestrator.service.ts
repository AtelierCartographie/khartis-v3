import { projectStore } from '../store/project.store.svelte';
import { datasetsStore } from '../store/datasets.store.svelte';
import {
  visualizationStore,
  VisualizationType
} from '../store/visualization.store.svelte';
import { layersActions } from '../../step-toolbar/tools/layers/layers.store.svelte';
import { projectionActions } from '../../step-toolbar/tools/projections/projection.store.svelte';
import type { UploadedFile } from '../store/create-project.types';
import { showError } from '../utils/notification.utils.svelte';
import { duckDBOrchestrator } from './duckdb-orchestrator.service';
import { logger, LogCategory } from '../utils/logger';

class DataOrchestratorService {
  private isInitialized = false;

  async initialize(): Promise<void> {
    await projectStore.waitForInit();

    const currentProject = projectStore.currentProject;

    if (currentProject?.data?.sourceFiles) {
      await this.processProjectFiles(currentProject.data.sourceFiles);
    }

    this.isInitialized = true;
  }

  async onFileAdded(file: UploadedFile): Promise<void> {
    logger.info('Processing file', LogCategory.DATA, {
      name: file.name,
      id: file.id,
      status: file.status,
      fileType: file.fileType,
      hasParsedData: !!file.parsedData,
      parsedDataLength: file.parsedData?.length
    });

    try {
      await datasetsStore.addFile(file);
      logger.info('File processed via datasetsStore', LogCategory.DATA);

      try {
        const duckDataset = await duckDBOrchestrator.processFile(file);
        logger.info(
          'DuckDB processing completed',
          LogCategory.DUCKDB,
          !!duckDataset
        );
      } catch (duckError) {
        logger.warn('DuckDB processing failed', LogCategory.DUCKDB, duckError);
      }

      const dataset = datasetsStore.getDatasetBySourceFile(file.id);
      if (!dataset) return;

      if (dataset.geometry) {
        projectionActions.suggestProjectionForCurrentData();
      }

      if (visualizationStore.visualizations.length === 0) {
        this.createDefaultVisualization(dataset.id);
      }

      layersActions.syncWithVisualizations();
    } catch (error) {
      showError(
        'Erreur traitement fichier',
        error instanceof Error ? error.message : 'Erreur inconnue'
      );
    }
  }

  async onFileRemoved(fileId: string): Promise<void> {
    const dataset = datasetsStore.getDatasetBySourceFile(fileId);
    if (dataset) {
      const visualizations = visualizationStore.getVisualizationsByDataset(
        dataset.id
      );
      visualizations.forEach((viz) => {
        visualizationStore.removeVisualization(viz.id);
      });

      datasetsStore.removeDataset(dataset.id);
      layersActions.syncWithVisualizations();
    }
  }

  async onProjectChanged(): Promise<void> {
    visualizationStore.clear();
    datasetsStore.clear();
    layersActions.reset();
    projectionActions.reset();

    const currentProject = projectStore.currentProject;
    if (currentProject?.data?.sourceFiles) {
      await this.processProjectFiles(currentProject.data.sourceFiles);
    }
  }

  private async processProjectFiles(files: UploadedFile[]): Promise<void> {
    await datasetsStore.processFiles(files);

    const geoDatasets = datasetsStore.getDatasetsByType(true);
    const tabularDatasets = datasetsStore.getDatasetsByType(false);

    if (geoDatasets.length > 0) {
      projectionActions.suggestProjectionForCurrentData();

      this.createDefaultVisualization(geoDatasets[0].id);
    } else if (tabularDatasets.length > 0) {
    }

    layersActions.syncWithVisualizations();
  }

  private createDefaultVisualization(datasetId: string): void {
    const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);
    if (!dataset) return;

    const numericColumns = dataset.columns.filter((c) => c.type === 'number');
    const stringColumns = dataset.columns.filter((c) => c.type === 'string');

    let visualizationType;
    if (dataset.geometry && numericColumns.length > 0) {
      visualizationType = VisualizationType.CHOROPLETH;
    } else if (dataset.geometry && stringColumns.length > 0) {
      visualizationType = VisualizationType.CATEGORICAL;
    } else if (numericColumns.length > 0) {
      visualizationType = VisualizationType.PROPORTIONAL;
    } else {
      return;
    }

    visualizationStore.createVisualization(visualizationType, datasetId);
  }

  async exportData(format: 'csv' | 'geojson' | 'json'): Promise<Blob> {
    const { exportProjectData } = await import('../utils/file-export.utils');
    const currentProject = projectStore.currentProject;

    if (!currentProject?.data?.sourceFiles) {
      throw new Error('Aucune donnée à exporter');
    }

    return exportProjectData(currentProject.data.sourceFiles, format);
  }

  getVisualizationData(visualizationId: string): any {
    const visualization = visualizationStore.visualizations.find(
      (v) => v.id === visualizationId
    );
    if (!visualization) return null;

    const dataset = datasetsStore.datasets.find(
      (d) => d.id === visualization.datasetId
    );
    if (!dataset) return null;

    return {
      visualization,
      dataset,
      projection: projectionActions.applyProjectionToDataset(
        dataset.id,
        800,
        600
      )
    };
  }

  syncAllStores(): void {
    datasetsStore.syncWithProject();
    layersActions.syncWithVisualizations();
  }
}

export const dataOrchestrator = new DataOrchestratorService();
