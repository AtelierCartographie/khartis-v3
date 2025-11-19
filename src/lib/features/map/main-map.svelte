<script lang="ts">
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { onMount } from 'svelte';
  import { datasetsStore } from '../commons/store/datasets.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import { LogCategory, logger } from '../commons/utils/logger';
  import DeckMap from './components/deck-map.svelte';
  import { basemapService } from './services/basemap.service.svelte';
  import type { FeatureCollection } from 'geojson';
  import type { DatasetResult } from '$lib/features/data-pipeline';

  let isInitializing = $state(true);
  let displayTable = $state<ArrowTable | null>(null);
  let displayGeoJSON = $state<FeatureCollection | null>(null);

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const duckDBDatasetsVersion = $derived(duckDBOrchestrator.datasetsVersion);

  async function convertDatasetToGeoJSON(
    dataset: DatasetResult
  ): Promise<ArrowTable | FeatureCollection | null> {
    const start = performance.now();
    logger.info('Preparing dataset for map rendering', LogCategory.MAP, {
      datasetId: dataset.id,
      fileName: dataset.name,
      hasGeometry: Boolean(dataset.geometry)
    });
    try {
      if (dataset.geometry && dataset.sourceFileId) {
        const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
          dataset.sourceFileId
        );

        if (duckDBDataset?.tableName) {
          // Use cached Arrow table if available (avoids expensive WKB→GeoArrow conversion)
          const arrowTable = duckDBDataset.arrowTableWithMetadata
            ? duckDBDataset.arrowTableWithMetadata
            : await duckDBOrchestrator.getArrowTableDirect(
                duckDBDataset.tableName
              );

          if (arrowTable) {
            logger.success('Arrow table ready for Deck.gl', LogCategory.MAP, {
              tableName: duckDBDataset.tableName,
              rows: arrowTable.numRows,
              cached: Boolean(duckDBDataset.arrowTableWithMetadata),
              durationMs: (performance.now() - start).toFixed(2)
            });
            return arrowTable;
          }
        }
      }

      logger.warn(
        'Dataset missing geometry metadata, falling back to basemap',
        LogCategory.MAP,
        {
          datasetId: dataset.id
        }
      );
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
    const start = performance.now();
    logger.info('Loading fallback basemap for map view', LogCategory.MAP);
    const basemap = await basemapService.loadDefaultBasemap();

    if (basemap?.geometryTable) {
      displayTable = basemap.geometryTable;
      displayGeoJSON = null;
      logger.success('Fallback basemap ready', LogCategory.MAP, {
        basemapId: basemap.metadata.file,
        durationMs: (performance.now() - start).toFixed(2)
      });
    } else {
      logger.error('Failed to load fallback basemap', LogCategory.MAP);
    }
  }

  $effect(() => {
    const _version = duckDBDatasetsVersion;
    if (isInitializing) {
      return;
    }

    if (selectedDataset) {
      logger.debug('Map reacting to dataset change', LogCategory.MAP, {
        datasetId: selectedDataset.id
      });
      if (selectedDataset.geometry) {
        convertDatasetToGeoJSON(selectedDataset).then((result) => {
          if (result) {
            // Check if result is ArrowTable or GeoJSON
            if ('numRows' in result) {
              // ArrowTable
              displayTable = result;
              displayGeoJSON = null;
              logger.info(
                'Map display updated with Arrow table',
                LogCategory.MAP,
                {
                  rows: result.numRows
                }
              );
            } else if ('features' in result) {
              // GeoJSON
              displayTable = null;
              displayGeoJSON = result;
              logger.info('Map display updated with GeoJSON', LogCategory.MAP, {
                features: result.features.length
              });
            }
          } else {
            loadFallbackBasemap();
          }
        });
      } else {
        loadFallbackBasemap();
      }
    } else {
      loadFallbackBasemap();
    }
  });

  onMount(async () => {
    const start = performance.now();
    logger.info('Initializing main map view', LogCategory.MAP);

    await basemapService.initialize();

    if (selectedDataset?.geometry) {
      const result = await convertDatasetToGeoJSON(selectedDataset);
      if (result) {
        // Check if result is ArrowTable or GeoJSON
        if ('numRows' in result) {
          // ArrowTable
          displayTable = result;
          displayGeoJSON = null;
        } else if ('features' in result) {
          // GeoJSON
          displayTable = null;
          displayGeoJSON = result;
        }
      } else {
        await loadFallbackBasemap();
      }
    } else {
      await loadFallbackBasemap();
    }

    logger.success('Main map initialized', LogCategory.MAP, {
      durationMs: (performance.now() - start).toFixed(2)
    });
    isInitializing = false;
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
    overflow: hidden;
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
