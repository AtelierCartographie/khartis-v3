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
  <!-- Skeleton loader - stays visible until map is fully rendered -->
  {#if !isMapReady}
    <div class="skeleton-loader" out:fade={{ duration: 300, easing: cubicOut }}>
      <SkeletonPlaceholder style="width: 100%; height: 100%;" />
    </div>
  {/if}

  <!-- Map wrapper - rendered once data is ready, visible when map is ready -->
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
    background-color: white;
    position: relative;
    border-radius: 4px;
  }

  .map-wrapper {
    width: 100%;
    height: 100%;
    opacity: 0;
    transform: scale(0.98);
    transition:
      opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .map-wrapper.visible {
    opacity: 1;
    transform: scale(1);
  }

  .skeleton-loader {
    position: absolute;
    inset: 0;
    z-index: 10;
    overflow: hidden;
    border-radius: 4px;
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
