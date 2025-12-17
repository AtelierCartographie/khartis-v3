<script lang="ts">
  import type { DatasetResult } from '$lib/features/data-pipeline';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import {
    InlineNotification,
    SkeletonPlaceholder
  } from 'carbon-components-svelte';
  import { WarningAlt } from 'carbon-icons-svelte';
  import type { FeatureCollection } from 'geojson';
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';
  import { datasetsStore } from '../commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '../commons/utils/logger';
  import DeckMap from './components/deck-map.svelte';
  import { basemapService } from './services/basemap.service.svelte';
  import { osmBasemapStore } from './stores/osm-basemap.store.svelte';

  let isInitializing = $state(true);
  let isMapReady = $state(false);
  let hasError = $state(false);
  let errorMessage = $state<string | null>(null);
  let displayTable = $state<ArrowTable | null>(null);
  let displayGeoJSON = $state<FeatureCollection | null>(null);
  let displayDatasetId = $state<string | undefined>(undefined);

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const duckDBDatasetsVersion = $derived(duckDBOrchestrator.datasetsVersion);
  const activeOSMBasemap = $derived(osmBasemapStore.activeOSMBasemap);

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
        'Dataset missing geometry metadata, showing empty map',
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
      hasError = true;
      errorMessage =
        error instanceof Error
          ? error.message
          : 'Erreur de conversion des donnees';
      return null;
    }
  }

  function clearDisplay(): void {
    displayTable = null;
    displayGeoJSON = null;
    displayDatasetId = undefined;
    logger.info('Cleared map display - showing empty map', LogCategory.MAP);
  }

  function setWaitingForData(datasetId: string): void {
    displayTable = null;
    displayGeoJSON = null;
    displayDatasetId = datasetId;
    logger.info('Waiting for data to load', LogCategory.MAP, { datasetId });
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
        displayDatasetId = dataset.id;
        logger.success('Joined basemap ready for rendering', LogCategory.MAP, {
          rows: joinedTable.numRows,
          durationMs: (performance.now() - start).toFixed(2)
        });
      } else {
        logger.warn(
          'No joined data returned, clearing display',
          LogCategory.MAP
        );
        clearDisplay();
      }
    } catch (error) {
      logger.error('Failed to load joined basemap', LogCategory.MAP, error);
      clearDisplay();
    }
  }

  async function loadGPSData(datasetId: string): Promise<void> {
    const start = performance.now();
    logger.info('Loading GPS data for OSM basemap', LogCategory.MAP, {
      datasetId
    });

    try {
      const { table } = await duckDBOrchestrator.getGPSArrowTable(datasetId);

      if (table) {
        displayTable = table;
        displayGeoJSON = null;
        displayDatasetId = datasetId;
        logger.success('GPS data ready for rendering on OSM', LogCategory.MAP, {
          rows: table.numRows,
          durationMs: (performance.now() - start).toFixed(2)
        });
      } else {
        logger.warn('No GPS data returned, clearing display', LogCategory.MAP);
        clearDisplay();
      }
    } catch (error) {
      logger.error('Failed to load GPS data', LogCategory.MAP, error);
      clearDisplay();
    }
  }

  $effect(() => {
    void duckDBDatasetsVersion;
    if (isInitializing) {
      return;
    }

    hasError = false;
    errorMessage = null;

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
              displayDatasetId = selectedDataset.id;
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
              displayDatasetId = selectedDataset.id;
              logger.info('Map display updated with GeoJSON', LogCategory.MAP, {
                features: result.features.length
              });
            }
          } else {
            // Data not ready yet, but dataset exists - set datasetId so DeckMap waits
            setWaitingForData(selectedDataset.id);
          }
        });
      } else {
        const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
          selectedDataset.sourceFileId
        );

        if (duckDBDataset?.gpsMode && duckDBDataset.gpsColumns) {
          loadGPSData(duckDBDataset.id);
        } else if (duckDBDataset?.joinedBasemap && duckDBDataset.tableName) {
          loadJoinedBasemap(
            selectedDataset,
            duckDBDataset.joinedBasemap,
            duckDBDataset.tableName
          );
        } else {
          // DuckDB dataset not ready yet - set datasetId so DeckMap waits
          setWaitingForData(selectedDataset.id);
        }
      }
    } else {
      clearDisplay();
    }
  });

  $effect(() => {
    const osmBasemap = activeOSMBasemap;
    if (isInitializing || !osmBasemap || !selectedDataset) {
      return;
    }

    const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
      selectedDataset.sourceFileId
    );

    if (duckDBDataset?.gpsMode && duckDBDataset.gpsColumns) {
      logger.info('OSM basemap activated, loading GPS data', LogCategory.MAP, {
        datasetId: duckDBDataset.id,
        osmBasemap: osmBasemap.file
      });
      loadGPSData(duckDBDataset.id);
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
          displayDatasetId = selectedDataset.id;
        } else if ('features' in result) {
          displayTable = null;
          displayGeoJSON = result;
          displayDatasetId = selectedDataset.id;
        }
      } else {
        // Data not ready yet, but dataset exists - set datasetId so DeckMap waits
        setWaitingForData(selectedDataset.id);
      }
    } else if (selectedDataset) {
      const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
        selectedDataset.sourceFileId
      );

      if (duckDBDataset?.gpsMode && duckDBDataset.gpsColumns) {
        await loadGPSData(duckDBDataset.id);
      } else if (duckDBDataset?.joinedBasemap && duckDBDataset.tableName) {
        await loadJoinedBasemap(
          selectedDataset,
          duckDBDataset.joinedBasemap,
          duckDBDataset.tableName
        );
      } else {
        // DuckDB dataset not ready yet - set datasetId so DeckMap waits
        setWaitingForData(selectedDataset.id);
      }
    } else {
      clearDisplay();
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

  <!-- Map wrapper - always rendered once initialized -->
  {#if !isInitializing && hasError}
    <div class="error-state" in:fade={{ duration: 300 }}>
      <div class="error-icon">
        <WarningAlt size={32} />
      </div>
      <InlineNotification
        kind="error"
        title="Erreur de chargement"
        subtitle={errorMessage ??
          'Une erreur est survenue lors du chargement de la carte'}
        hideCloseButton
        lowContrast
      />
    </div>
  {:else if !isInitializing}
    <div class="map-wrapper" class:visible={isMapReady}>
      <DeckMap
        jsTable={displayTable}
        userGeoJSON={displayGeoJSON}
        datasetId={displayDatasetId}
        onReady={handleMapReady}
      />
    </div>
  {/if}
</div>

<style>
  .map-container {
    width: 100%;
    height: 100%;
    min-height: 400px;
    background-color: var(--cds-ui-background);
    position: relative;
    border-radius: 4px;
  }

  .map-wrapper {
    position: absolute;
    inset: 0;
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
    pointer-events: none;
  }

  .skeleton-loader :global(.bx--skeleton__placeholder) {
    width: 100%;
    height: 100%;
  }

  .error-state {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 2rem;
    background: var(--cds-ui-01, #f4f4f4);
  }

  .error-icon {
    color: var(--cds-support-error, #da1e28);
  }

  .error-state :global(.bx--inline-notification) {
    max-width: 400px;
  }
</style>
