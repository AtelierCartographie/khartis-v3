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
import { duckDBOrchestrator } from "$lib/features/commons/services/duckdb-orchestrator.service.svelte";
import { logger, LogCategory } from '../utils/logger';
import { getParsedDataLength } from '$lib/types/data';
import { DataValidationError } from '../errors/pipeline.errors';
import { ColumnType } from '$lib/features/data/domain';

class DataOrchestratorService {
  private isInitialized = false;

  private _geometryDatasetsVersion = $state(0);

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
      parsedDataLength: getParsedDataLength(file.parsedData)
    });

    try {
      await datasetsStore.addFile(file);
      logger.info('File processed via datasetsStore', LogCategory.DATA);

      // dataPipeline already created the DuckDB table, so we don't need to call
      // duckDBOrchestrator.processFile() which would create a duplicate table.
      // Instead, we need to register the table that dataPipeline created in duckDBOrchestrator.

      const dataset = datasetsStore.getDatasetBySourceFile(file.id);
      if (!dataset) {
        logger.warn('Dataset not found after processing', LogCategory.DATA, {
          fileId: file.id
        });
        return;
      }

      // Register the table created by dataPipeline in duckDBOrchestrator
      if (dataset.tableName) {
        console.log('[DataOrchestrator] About to register table from dataPipeline', {
          tableName: dataset.tableName,
          sourceFileId: file.id,
          fileName: file.name,
          datasetId: dataset.id,
          currentDuckDBDatasets: duckDBOrchestrator.getAllDatasets().length
        });

        try {
          const duckDataset = await duckDBOrchestrator.registerExistingTable(
            dataset.tableName,
            file.id,
            file.name
          );
          console.log('[DataOrchestrator] Table registered successfully', {
            tableName: dataset.tableName,
            duckDatasetId: duckDataset?.id,
            totalDuckDBDatasets: duckDBOrchestrator.getAllDatasets().length,
            allDuckDBSourceFileIds: duckDBOrchestrator.getAllDatasets().map(d => d.sourceFileId)
          });
          logger.info('Table registered in duckDBOrchestrator', LogCategory.DUCKDB, {
            tableName: dataset.tableName
          });
        } catch (registerError) {
          console.error('[DataOrchestrator] Failed to register table', registerError);
          logger.warn(
            'Failed to register table in duckDBOrchestrator',
            LogCategory.DUCKDB,
            registerError
          );
        }
      } else {
        console.warn('[DataOrchestrator] No tableName in dataset!', {
          datasetId: dataset.id,
          datasetName: dataset.name
        });
      }

      if (dataset.geometry) {
        this._geometryDatasetsVersion++;
        projectionActions.suggestProjectionForCurrentData();
      }

      const existingVisualizations =
        visualizationStore.getVisualizationsByDataset(dataset.id);
      if (existingVisualizations.length === 0) {
        this.createDefaultVisualization(dataset.id);
        logger.info('Default visualization created', LogCategory.DATA, {
          datasetId: dataset.id
        });
      } else {
        logger.info(
          'Visualization already exists for dataset',
          LogCategory.DATA,
          { datasetId: dataset.id }
        );
      }

      layersActions.syncWithVisualizations();
    } catch (error) {
      showError(
        'Erreur traitement fichier',
        error instanceof Error ? error.message : 'Erreur inconnue'
      );
    }
  }

  get geometryDatasetsVersion() {
    return this._geometryDatasetsVersion;
  }

  async onFileRemoved(fileId: string): Promise<void> {
    console.log('[DataOrchestrator] onFileRemoved called', { fileId });

    const dataset = datasetsStore.getDatasetBySourceFile(fileId);
    console.log('[DataOrchestrator] Dataset found?', {
      found: !!dataset,
      datasetId: dataset?.id,
      datasetName: dataset?.name
    });

    if (dataset) {
      const visualizations = visualizationStore.getVisualizationsByDataset(
        dataset.id
      );
      console.log('[DataOrchestrator] Removing visualizations', {
        count: visualizations.length
      });
      visualizations.forEach((viz) => {
        visualizationStore.removeVisualization(viz.id);
      });

      const duckDataset = duckDBOrchestrator
        .getAllDatasets()
        .find((d) => d.sourceFileId === fileId);
      if (duckDataset) {
        console.log('[DataOrchestrator] Dropping DuckDB table', {
          tableName: duckDataset.tableName
        });
        await duckDBOrchestrator.dropTable(duckDataset.tableName);
        logger.info(
          `Dropped DuckDB table: ${duckDataset.tableName}`,
          LogCategory.DUCKDB
        );
        this._geometryDatasetsVersion++;
      }

      console.log('[DataOrchestrator] About to call datasetsStore.removeDataset', {
        datasetId: dataset.id
      });
      datasetsStore.removeDataset(dataset.id);
      layersActions.syncWithVisualizations();
      console.log('[DataOrchestrator] onFileRemoved complete');
    } else {
      console.warn('[DataOrchestrator] No dataset found for fileId', { fileId });
    }

    // Clean up orphaned datasets (datasets whose sourceFileId no longer exists in project)
    this.cleanupOrphanedDatasets();
  }

  private cleanupOrphanedDatasets(): void {
    const currentProject = projectStore.currentProject;
    if (!currentProject?.data?.sourceFiles) return;

    const validSourceFileIds = new Set(
      currentProject.data.sourceFiles.map((f) => f.id)
    );

    const allDatasets = datasetsStore.getAllDatasets();
    const orphanedDatasets = allDatasets.filter(
      (d) => !validSourceFileIds.has(d.sourceFileId)
    );

    console.log('[DataOrchestrator] Cleaning up orphaned datasets', {
      totalDatasets: allDatasets.length,
      validSourceFileIds: Array.from(validSourceFileIds),
      orphanedCount: orphanedDatasets.length,
      orphanedIds: orphanedDatasets.map((d) => ({
        datasetId: d.id,
        sourceFileId: d.sourceFileId,
        name: d.name
      }))
    });

    orphanedDatasets.forEach((dataset) => {
      console.log('[DataOrchestrator] Removing orphaned dataset', {
        datasetId: dataset.id,
        sourceFileId: dataset.sourceFileId
      });
      datasetsStore.removeDataset(dataset.id);
    });
  }

  async onProjectChanged(): Promise<void> {
    const startTime = performance.now();
    console.log(
      `[${new Date().toISOString()}] [DataOrchestrator:onProjectChanged] START`
    );

    visualizationStore.clear();
    datasetsStore.clear();
    layersActions.reset();
    projectionActions.reset();

    const currentProject = projectStore.currentProject;
    if (currentProject?.data?.sourceFiles) {
      console.log(
        `[${new Date().toISOString()}] [DataOrchestrator:onProjectChanged] Processing project files...`,
        {
          fileCount: currentProject.data.sourceFiles.length
        }
      );
      await this.processProjectFiles(currentProject.data.sourceFiles);
    }

    const duration = performance.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] [DataOrchestrator:onProjectChanged] END`,
      {
        duration: `${duration.toFixed(2)}ms`
      }
    );
  }

  private async processProjectFiles(files: UploadedFile[]): Promise<void> {
    const startTime = performance.now();
    console.log(
      `[${new Date().toISOString()}] [DataOrchestrator:processProjectFiles] START`,
      {
        fileCount: files.length
      }
    );

    // Yield to event loop to avoid blocking UI
    await new Promise((resolve) => setTimeout(resolve, 0));

    console.log(
      `[${new Date().toISOString()}] [DataOrchestrator:processProjectFiles] Processing via datasetsStore...`
    );
    const datasetsStart = performance.now();
    await datasetsStore.processFiles(files);
    console.log(
      `[${new Date().toISOString()}] [DataOrchestrator:processProjectFiles] DatasetsStore processing completed`,
      {
        duration: `${(performance.now() - datasetsStart).toFixed(2)}ms`
      }
    );

    // Process DuckDB files in parallel to avoid blocking
    console.log(
      `🔷 [${new Date().toISOString()}] [DataOrchestrator:processProjectFiles] ===== DUCKDB START =====`
    );
    const duckStart = performance.now();
    const validFiles = files.filter(
      (file) => file.status === 'complete' && file.parsedData
    );
    console.log(
      `📁 [${new Date().toISOString()}] [DataOrchestrator:processProjectFiles] ${validFiles.length} files to process in DuckDB`
    );

    const duckDBPromises = validFiles.map(async (file, index) => {
      const fileStart = performance.now();
      console.log(
        `🔷 [${new Date().toISOString()}] [DataOrchestrator] Processing file ${index + 1}/${validFiles.length}: ${file.name}`
      );

      // Yield to event loop between each file
      await new Promise((resolve) => setTimeout(resolve, 0));

      try {
        const processStart = performance.now();
        await duckDBOrchestrator.processFile(file);
        const processDuration = performance.now() - processStart;
        console.log(
          `✅ [${new Date().toISOString()}] [DataOrchestrator] File ${index + 1}/${validFiles.length} processed in ${processDuration.toFixed(2)}ms: ${file.name}`
        );

        logger.info(
          'DuckDB file reloaded on project restore',
          LogCategory.DUCKDB,
          { name: file.name }
        );
      } catch (error) {
        const errorDuration = performance.now() - fileStart;
        console.error(
          `❌ [${new Date().toISOString()}] [DataOrchestrator] File ${index + 1}/${validFiles.length} FAILED after ${errorDuration.toFixed(2)}ms: ${file.name}`,
          error
        );

        logger.warn(
          'Failed to reload file in DuckDB',
          LogCategory.DUCKDB,
          error
        );
      }
    });

    await Promise.all(duckDBPromises);
    const duckDuration = performance.now() - duckStart;
    console.log(
      `🎉 [${new Date().toISOString()}] [DataOrchestrator:processProjectFiles] ===== DUCKDB END ===== Total: ${duckDuration.toFixed(2)}ms`
    );

    const geoDatasets = datasetsStore.getDatasetsByType(true);

    if (geoDatasets.length > 0) {
      console.log(
        `[${new Date().toISOString()}] [DataOrchestrator:processProjectFiles] Creating default visualization...`
      );
      this._geometryDatasetsVersion++;
      projectionActions.suggestProjectionForCurrentData();

      this.createDefaultVisualization(geoDatasets[0].id);
    }

    layersActions.syncWithVisualizations();

    const totalDuration = performance.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] [DataOrchestrator:processProjectFiles] END`,
      {
        totalDuration: `${totalDuration.toFixed(2)}ms`
      }
    );
  }

  private createDefaultVisualization(datasetId: string): void {
    const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);
    if (!dataset) return;

    const numericColumns = dataset.columns.filter(
      (c) => c.type === ColumnType.NUMBER
    );
    const stringColumns = dataset.columns.filter(
      (c) => c.type === ColumnType.TEXT
    );

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
      throw new DataValidationError('Aucune donnée à exporter');
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
}

export const dataOrchestrator = new DataOrchestratorService();
