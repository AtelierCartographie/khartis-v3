<script lang="ts">
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { onMount } from 'svelte';
  import { datasetsStore } from '../commons/store/datasets.store.svelte';
  import { duckDBOrchestrator } from '../commons/services/duckdb-orchestrator.service.svelte';
  import { LogCategory, logger } from '../commons/utils/logger';
  import DeckMap from './components/deck-map.svelte';
  import { basemapService } from './services/basemap.service.svelte';

  let isInitializing = $state(true);
  let displayTable = $state<ArrowTable | null>(null);
  let displayGeoJSON = $state<any | null>(null);

const selectedDataset = $derived(datasetsStore.selectedDataset);
const duckDBDatasetsVersion = $derived(duckDBOrchestrator.datasetsVersion);

  async function convertDatasetToGeoJSON(dataset: any): Promise<any | null> {
    try {
      logger.info('Processing dataset for geometry', LogCategory.MAP, {
        name: dataset.name,
        hasGeometry: !!dataset.geometry,
        tableName: dataset.tableName,
        sourceFileId: dataset.sourceFileId,
        dataLength: dataset.data?.length
      });

      if (dataset.geometry && dataset.sourceFileId) {
        // Get the DuckDB dataset (with GeoArrow metadata) by sourceFileId
        const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId);

        logger.info('DuckDB dataset lookup', LogCategory.MAP, {
          sourceFileId: dataset.sourceFileId,
          found: !!duckDBDataset,
          duckDBTableName: duckDBDataset?.tableName,
          allDuckDBDatasets: duckDBOrchestrator.getAllDatasets().map(d => ({
            id: d.id,
            sourceFileId: d.sourceFileId,
            tableName: d.tableName
          }))
        });

        if (duckDBDataset?.tableName) {
          logger.info('Getting Arrow table from DuckDB orchestrator', LogCategory.MAP, {
            name: dataset.name,
            duckDBTableName: duckDBDataset.tableName,
            datasetTableName: dataset.tableName
          });

          // Use Arrow table directly from DuckDB orchestrator (has GeoArrow metadata)
          const arrowTable = await duckDBOrchestrator.getArrowTable(duckDBDataset.tableName);
          if (arrowTable) {
            logger.success('Arrow table loaded for display', LogCategory.MAP, {
              rowCount: arrowTable.numRows,
              hasMetadata: !!arrowTable.schema?.metadata
            });
            return arrowTable;
          }
        }
      } else {
        logger.warn('DuckDB dataset missing for selected dataset', LogCategory.MAP, {
          datasetId: dataset.id,
          sourceFileId: dataset.sourceFileId
        });
      }

      logger.warn('No geographic column found in dataset', LogCategory.MAP, {
        hasGeometry: !!dataset.geometry,
        hasSourceFileId: !!dataset.sourceFileId
      });
      return null;
    } catch (error) {
      logger.error(
        'Failed to convert dataset to GeoJSON',
        LogCategory.MAP,
        error
      );
      return null;
    }
  }

  async function loadFallbackBasemap(): Promise<void> {
    logger.info('Loading fallback basemap', LogCategory.MAP);

    const basemap = await basemapService.loadDefaultBasemap();

    if (basemap?.geometryTable) {
      displayTable = basemap.geometryTable;
      logger.success('Fallback basemap loaded', LogCategory.MAP);
    } else {
      logger.error('Failed to load fallback basemap', LogCategory.MAP);
    }
  }

  $effect(() => {
    duckDBDatasetsVersion;
    if (isInitializing) {
      logger.info('Skipping effect during initialization', LogCategory.MAP);
      return;
    }

    if (selectedDataset) {
      logger.info('Dataset selected, processing...', LogCategory.MAP, {
        name: selectedDataset.name,
        hasGeometry: !!selectedDataset.geometry
      });

      if (selectedDataset.geometry) {
        convertDatasetToGeoJSON(selectedDataset).then((result) => {
          if (result) {
            // Check if result is ArrowTable or GeoJSON
            if ('numRows' in result) {
              // ArrowTable
              displayTable = result;
              displayGeoJSON = null;
              logger.success(
                'Dataset Arrow table ready for display',
                LogCategory.MAP,
                {
                  rowCount: result.numRows
                }
              );
            } else if ('features' in result) {
              // GeoJSON
              displayTable = null;
              displayGeoJSON = result;
              logger.success(
                'Dataset GeoJSON ready for display',
                LogCategory.MAP,
                {
                  featureCount: result.features.length
                }
              );
            }
          } else {
            logger.warn(
              'Dataset conversion failed, loading basemap',
              LogCategory.MAP
            );
            loadFallbackBasemap();
          }
        });
      } else {
        logger.info(
          'Dataset has no geometry, loading basemap',
          LogCategory.MAP
        );
        loadFallbackBasemap();
      }
    } else {
      logger.info('No dataset selected, loading basemap', LogCategory.MAP);
      loadFallbackBasemap();
    }
  });

  onMount(async () => {
    logger.info('Initializing map component', LogCategory.MAP);

    await basemapService.initialize();

    if (selectedDataset?.geometry) {
      logger.info(
        'Initial dataset has geometry, converting...',
        LogCategory.MAP
      );
      const result = await convertDatasetToGeoJSON(selectedDataset);
      if (result) {
        // Check if result is ArrowTable or GeoJSON
        if ('numRows' in result) {
          // ArrowTable
          displayTable = result;
          displayGeoJSON = null;
          logger.success('Initial dataset Arrow table loaded', LogCategory.MAP);
        } else if ('features' in result) {
          // GeoJSON
          displayTable = null;
          displayGeoJSON = result;
          logger.success('Initial dataset GeoJSON loaded', LogCategory.MAP);
        }
      } else {
        await loadFallbackBasemap();
      }
    } else {
      logger.info(
        'No initial dataset geometry, loading basemap',
        LogCategory.MAP
      );
      await loadFallbackBasemap();
    }

    isInitializing = false;
    logger.success('Map component initialized', LogCategory.MAP);
  });
</script>

<div class="map-container">
  {#if isInitializing}
    <div class="loading-state">Initializing map...</div>
  {:else if displayTable}
    <DeckMap jsTable={displayTable} userGeoJSON={null} />
  {:else if displayGeoJSON}
    <DeckMap jsTable={null} userGeoJSON={displayGeoJSON} />
  {:else}
    <div class="empty-state">No data loaded</div>
  {/if}
</div>

<style>
  .map-container {
    width: 100%;
    max-height: 500px;
    height: 500px;
    background-color: white;
    position: relative;
    overflow-y: auto;
  }

  .loading-state,
  .empty-state {
    width: 100%;
    height: 500px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cds-text-secondary);
    background-color: white;
  }
</style>
