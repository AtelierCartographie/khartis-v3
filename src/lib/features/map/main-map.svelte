<script lang="ts">
  import type { DatasetResult } from '$lib/features/data-pipeline';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { SkeletonPlaceholder } from 'carbon-components-svelte';
  import type { FeatureCollection } from 'geojson';
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';
  import { datasetsStore } from '../commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '../commons/utils/logger';
  import DeckMap from './components/deck-map.svelte';
  import { basemapService } from './services/basemap.service.svelte';

  let isInitializing = $state(true);
  let isMapReady = $state(false);
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

  async function loadJoinedBasemap(
    dataset: DatasetResult,
    joinedBasemap: string,
    tableName: string
  ): Promise<void> {
    const start = performance.now();
    logger.info('Loading joined basemap for tabular dataset', LogCategory.MAP, {
      datasetId: dataset.id,
      joinedBasemap,
      tableName
    });

    try {
      const joinedTable = await duckDBOrchestrator.getJoinedArrowTable(
        tableName,
        joinedBasemap
      );

      if (joinedTable) {
        displayTable = joinedTable;
        displayGeoJSON = null;
        logger.success('Joined basemap ready for rendering', LogCategory.MAP, {
          rows: joinedTable.numRows,
          durationMs: (performance.now() - start).toFixed(2)
        });
      } else {
        logger.warn(
          'No joined data returned, falling back to basemap',
          LogCategory.MAP
        );
        await loadFallbackBasemap();
      }
    } catch (error) {
      logger.error('Failed to load joined basemap', LogCategory.MAP, error);
      await loadFallbackBasemap();
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

      // Check if dataset has native geometry (GeoJSON, Shapefile, etc.)
      if (selectedDataset.geometry) {
        convertDatasetToGeoJSON(selectedDataset).then((result) => {
          if (result) {
            if ('numRows' in result) {
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
        // Check if dataset is joined to a basemap (tabular data)
        const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
          selectedDataset.sourceFileId
        );

        if (duckDBDataset?.joinedBasemap && duckDBDataset.tableName) {
          loadJoinedBasemap(
            selectedDataset,
            duckDBDataset.joinedBasemap,
            duckDBDataset.tableName
          );
        } else {
          loadFallbackBasemap();
        }
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
      // Dataset has native geometry
      const result = await convertDatasetToGeoJSON(selectedDataset);
      if (result) {
        if ('numRows' in result) {
          displayTable = result;
          displayGeoJSON = null;
        } else if ('features' in result) {
          displayTable = null;
          displayGeoJSON = result;
        }
      } else {
        await loadFallbackBasemap();
      }
    } else if (selectedDataset) {
      // Check if tabular dataset is joined to a basemap
      const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
        selectedDataset.sourceFileId
      );

      if (duckDBDataset?.joinedBasemap && duckDBDataset.tableName) {
        await loadJoinedBasemap(
          selectedDataset,
          duckDBDataset.joinedBasemap,
          duckDBDataset.tableName
        );
      } else {
        await loadFallbackBasemap();
      }
    } else {
      await loadFallbackBasemap();
    }

    logger.success('Main map data ready', LogCategory.MAP, {
      durationMs: (performance.now() - start).toFixed(2)
    });
    isInitializing = false;
  });

  function handleMapReady() {
    logger.success('Map fully rendered', LogCategory.MAP);
    isMapReady = true;
  }
</script>

<div class="map-container">
  <!-- Skeleton loader - only during initial load -->
  {#if !isMapReady}
    <div class="skeleton-loader" out:fade={{ duration: 300, easing: cubicOut }}>
      <SkeletonPlaceholder style="width: 100%; height: 100%;" />
    </div>
  {/if}

  <!-- Map wrapper - rendered once data is ready -->
  {#if !isInitializing && displayTable}
    <div class="map-wrapper" class:visible={isMapReady}>
      <DeckMap
        jsTable={displayTable}
        userGeoJSON={null}
        onReady={handleMapReady}
      />
    </div>
  {:else if !isInitializing && displayGeoJSON}
    <div class="map-wrapper" class:visible={isMapReady}>
      <DeckMap
        jsTable={null}
        userGeoJSON={displayGeoJSON}
        onReady={handleMapReady}
      />
    </div>
  {:else if !isInitializing}
    <div class="empty-state" in:fade={{ duration: 300 }}>
      <div class="empty-icon">
        <svg
          viewBox="0 0 24 24"
          width="48"
          height="48"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
      </div>
      <span>Aucune donnee chargee</span>
    </div>
  {/if}
</div>

<style>
  .map-container {
    width: 100%;
    background-color: var(--cds-ui-background);
    position: relative;
    border-radius: 4px;
  }

  .map-wrapper {
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 0.3s ease-out;
  }

  .map-wrapper.visible {
    opacity: 1;
  }

  .skeleton-loader {
    position: absolute;
    inset: 0;
    z-index: 10;
    overflow: hidden;
  }

  .skeleton-loader :global(.bx--skeleton__placeholder) {
    width: 100%;
    height: 100%;
  }

  .empty-state {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--cds-text-secondary, #525252);
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  }

  .empty-icon {
    opacity: 0.5;
  }
</style>
