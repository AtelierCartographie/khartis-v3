<script lang="ts">
  import type { DatasetResult } from '$lib/features/data-pipeline';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import {
    InlineNotification,
    SkeletonPlaceholder
  } from 'carbon-components-svelte';
  import { WarningAlt } from 'carbon-icons-svelte';
  import type { FeatureCollection } from 'geojson';
  import { onMount, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { SvelteMap } from 'svelte/reactivity';
  import { fade } from 'svelte/transition';
  import { datasetsStore } from '../commons/store/datasets.store.svelte';
  import { globalState } from '../commons/store/global.svelte';
  import { LogCategory, logger } from '../commons/utils/logger';
  import { applyColorBlindnessFilter } from '../commons/utils/color-blindness-filters';
  import { getColorBlindnessState } from '../step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import {
    formatActions,
    formatState
  } from '../step-toolbar/tools/format/format.store.svelte';
  import ThematicMap from './components/thematic-map.svelte';
  import { osmBasemapStore } from './stores/osm-basemap.store.svelte';

  let containerRef: HTMLDivElement;
  let thematicMapRef = $state<HTMLDivElement>(undefined!);

  let isInitializing = $state(true);
  let isMapReady = $state(false);
  let hasError = $state(false);
  let errorMessage = $state<string | null>(null);
  let isResizing = $state(false);
  let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const TOOLBAR_TRANSITION_MS = 600;
  let displayTables = $state<SvelteMap<string, ArrowTable>>(
    new SvelteMap<string, ArrowTable>()
  );
  let displayGeoJSONs = $state<SvelteMap<string, FeatureCollection>>(
    new SvelteMap<string, FeatureCollection>()
  );

  const enabledDatasets = $derived(datasetsStore.enabledDatasets);
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

  function removeDatasetFromDisplay(datasetId: string): void {
    displayTables.delete(datasetId);
    displayGeoJSONs.delete(datasetId);
  }

  async function loadJoinedBasemap(
    dataset: DatasetResult,
    joinedBasemap: string,
    tableName: string
  ): Promise<void> {
    const start = performance.now();
    const datasetId = dataset.id;

    logger.info('Loading joined basemap for tabular dataset', LogCategory.MAP, {
      datasetId,
      joinedBasemap,
      tableName
    });

    try {
      const joinedTable = await duckDBOrchestrator.getJoinedArrowTable(
        tableName,
        joinedBasemap
      );

      if (!datasetsStore.isDatasetEnabled(datasetId)) {
        logger.debug(
          'Dataset no longer enabled, ignoring joined basemap',
          LogCategory.MAP,
          { datasetId }
        );
        return;
      }

      if (joinedTable) {
        displayTables.set(datasetId, joinedTable);
        displayGeoJSONs.delete(datasetId);
        logger.success('Joined basemap ready for rendering', LogCategory.MAP, {
          datasetId,
          rows: joinedTable.numRows,
          durationMs: (performance.now() - start).toFixed(2)
        });
      } else {
        logger.warn('No joined data returned for dataset', LogCategory.MAP, {
          datasetId
        });
        removeDatasetFromDisplay(datasetId);
      }
    } catch (error) {
      logger.error('Failed to load joined basemap', LogCategory.MAP, error);
      removeDatasetFromDisplay(dataset.id);
    }
  }

  async function loadGPSData(
    datasetId: string,
    duckDBDatasetId: string
  ): Promise<void> {
    const start = performance.now();

    logger.info('Loading GPS data for OSM basemap', LogCategory.MAP, {
      datasetId,
      duckDBDatasetId
    });

    try {
      const { table } =
        await duckDBOrchestrator.getGPSArrowTable(duckDBDatasetId);

      if (!datasetsStore.isDatasetEnabled(datasetId)) {
        logger.debug(
          'Dataset no longer enabled, ignoring GPS data',
          LogCategory.MAP,
          { datasetId }
        );
        return;
      }

      if (table) {
        displayTables.set(datasetId, table);
        displayGeoJSONs.delete(datasetId);
        logger.success('GPS data ready for rendering on OSM', LogCategory.MAP, {
          datasetId,
          rows: table.numRows,
          durationMs: (performance.now() - start).toFixed(2)
        });
      } else {
        logger.warn('No GPS data returned for dataset', LogCategory.MAP, {
          datasetId
        });
        removeDatasetFromDisplay(datasetId);
      }
    } catch (error) {
      logger.error('Failed to load GPS data', LogCategory.MAP, error);
      removeDatasetFromDisplay(datasetId);
    }
  }

  async function loadDatasetForDisplay(dataset: DatasetResult): Promise<void> {
    const datasetId = dataset.id;

    if (dataset.geometry) {
      const result = await convertDatasetToGeoJSON(dataset);

      if (!datasetsStore.isDatasetEnabled(datasetId)) {
        logger.debug(
          'Dataset no longer enabled, ignoring result',
          LogCategory.MAP,
          { datasetId }
        );
        return;
      }

      if (result) {
        if ('numRows' in result) {
          displayTables.set(datasetId, result);
          displayGeoJSONs.delete(datasetId);
          logger.info(
            'Dataset added to display as Arrow table',
            LogCategory.MAP,
            {
              datasetId,
              rows: result.numRows
            }
          );
        } else if ('features' in result) {
          displayGeoJSONs.set(datasetId, result);
          displayTables.delete(datasetId);
          logger.info('Dataset added to display as GeoJSON', LogCategory.MAP, {
            datasetId,
            features: result.features.length
          });
        }
      }
    } else {
      const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
        dataset.sourceFileId
      );

      if (duckDBDataset?.gpsMode && duckDBDataset.gpsColumns) {
        await loadGPSData(datasetId, duckDBDataset.id);
      } else if (duckDBDataset?.joinedBasemap && duckDBDataset.tableName) {
        await loadJoinedBasemap(
          dataset,
          duckDBDataset.joinedBasemap,
          duckDBDataset.tableName
        );
      }
    }
  }

  $effect(() => {
    void duckDBDatasetsVersion;
    const currentEnabledDatasets = enabledDatasets;

    if (isInitializing) {
      return;
    }

    hasError = false;
    errorMessage = null;

    const currentEnabledIds = new Set(currentEnabledDatasets.map((d) => d.id));

    const tableIdsToRemove = [...displayTables.keys()].filter(
      (id) => !currentEnabledIds.has(id)
    );

    for (const tableId of tableIdsToRemove) {
      displayTables.delete(tableId);
    }

    const geojsonIdsToRemove = [...displayGeoJSONs.keys()].filter(
      (id) => !currentEnabledIds.has(id)
    );

    for (const geojsonId of geojsonIdsToRemove) {
      displayGeoJSONs.delete(geojsonId);
    }

    for (const dataset of currentEnabledDatasets) {
      const alreadyLoaded =
        displayTables.has(dataset.id) || displayGeoJSONs.has(dataset.id);
      if (!alreadyLoaded) {
        loadDatasetForDisplay(dataset);
      }
    }
  });

  $effect(() => {
    const osmBasemap = activeOSMBasemap;
    if (isInitializing || !osmBasemap) {
      return;
    }

    for (const dataset of enabledDatasets) {
      const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
        dataset.sourceFileId
      );

      if (duckDBDataset?.gpsMode && duckDBDataset.gpsColumns) {
        logger.info(
          'OSM basemap activated, loading GPS data',
          LogCategory.MAP,
          {
            datasetId: dataset.id,
            osmBasemap: osmBasemap.file
          }
        );
        loadGPSData(dataset.id, duckDBDataset.id);
      }
    }
  });

  let resizeObserver: ResizeObserver | null = null;

  $effect(() => {
    void globalState.toolbarState;

    untrack(() => {
      if (!isMapReady) return;

      isResizing = true;

      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId);
      }

      resizeTimeoutId = setTimeout(() => {
        isResizing = false;
        resizeTimeoutId = null;
      }, TOOLBAR_TRANSITION_MS);
    });
  });

  function handleContainerResize() {
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    formatActions.fitToContainer(rect.width, rect.height);
  }

  async function initializeMap() {
    const start = performance.now();
    logger.info('Initializing main map view', LogCategory.MAP, {
      enabledCount: enabledDatasets.length
    });

    const loadPromises = enabledDatasets.map((dataset) =>
      loadDatasetForDisplay(dataset)
    );
    await Promise.all(loadPromises);

    logger.success('Main map data ready', LogCategory.MAP, {
      durationMs: (performance.now() - start).toFixed(2),
      tablesLoaded: displayTables.size,
      geoJSONsLoaded: displayGeoJSONs.size
    });
    isInitializing = false;
  }

  onMount(() => {
    handleContainerResize();

    resizeObserver = new ResizeObserver(() => {
      handleContainerResize();
    });
    resizeObserver.observe(containerRef);

    initializeMap();

    return () => {
      resizeObserver?.disconnect();
      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId);
      }
    };
  });

  function handleMapReady() {
    logger.success('Map fully rendered', LogCategory.MAP);
    isMapReady = true;
  }

  const colorBlindnessState = $derived(getColorBlindnessState());

  $effect(() => {
    const simulationType = colorBlindnessState.simulationType;
    if (thematicMapRef) {
      applyColorBlindnessFilter(thematicMapRef, simulationType);
    }
  });
</script>

<div class="main-map-container" bind:this={containerRef}>
  <!-- Skeleton loader - only during initial load -->
  {#if !isMapReady}
    <div
      class="skeleton-loader"
      style="width: {formatState.width}px; height: {formatState.height}px;"
      out:fade={{ duration: 300, easing: cubicOut }}
    >
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
        title={m.error_loading_title()}
        subtitle={errorMessage ?? m.error_loading_subtitle()}
        hideCloseButton
        lowContrast
      />
    </div>
  {:else if !isInitializing}
    <div
      class="thematic-map-wrapper"
      class:visible={isMapReady}
      bind:this={thematicMapRef}
    >
      <ThematicMap
        tables={displayTables}
        geoJSONs={displayGeoJSONs}
        width={formatState.width}
        height={formatState.height}
        onReady={handleMapReady}
      />
      <div class="resize-overlay" class:active={isResizing}></div>
    </div>
  {/if}
</div>

<style>
  .main-map-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    position: relative;
  }

  .thematic-map-wrapper {
    opacity: 0;
    transition: opacity 0.3s ease-out;
    position: relative;
  }

  .thematic-map-wrapper.visible {
    opacity: 1;
  }

  .resize-overlay {
    position: absolute;
    inset: 0;
    background: var(--cds-ui-background, #f4f4f4);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease-out;
  }

  .resize-overlay.active {
    opacity: 1;
    transition: none;
  }

  .skeleton-loader {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;
    overflow: hidden;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    border-radius: 2px;
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
