<script lang="ts">
  import type { DatasetResult } from '$lib/features/data-pipeline';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { InlineNotification } from 'carbon-components-svelte';
  import { WarningAlt } from 'carbon-icons-svelte';
  import type { FeatureCollection } from 'geojson';
  import { onMount, untrack } from 'svelte';

  import { SvelteMap } from 'svelte/reactivity';
  import { fade } from 'svelte/transition';
  import { datasetsStore } from '../commons/store/datasets.store.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { isWgs84LikeCrs } from './utils/dataset-crs';
  import { globalState } from '../commons/store/global.svelte';
  import { ToolbarStep } from '../commons/types/global';
  import { LogCategory, logger } from '../commons/utils/logger';
  import { applyColorBlindnessFilter } from '../commons/utils/color-blindness-filters';
  import {
    ColorBlindnessType,
    FormatMode
  } from '../commons/constants/ui.constants';
  import { getColorBlindnessState } from '../step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import {
    formatActions,
    formatState
  } from '../step-toolbar/tools/format/format.store.svelte';
  import { EVENT } from '../commons/constants/dom.constants';
  import MapSkeleton from './components/map-skeleton.svelte';
  import ThematicMap from './components/thematic-map.svelte';
  import { osmBasemapStore } from './stores/osm-basemap.store.svelte';
  import { facetsStore } from '../step-toolbar/tools/facets/facets.store.svelte';
  import FacetsGrid from '../step-toolbar/tools/facets/facets-grid.svelte';
  import { loadDatasetsSequentially } from './utils/load-datasets-sequentially';

  let thematicMapRef = $state<HTMLDivElement>(undefined!);

  let isInitializing = $state(true);
  let isMapReady = $state(false);
  const skeletonShownAt = Date.now();
  let hasError = $state(false);
  let errorMessage = $state<string | null>(null);
  let toolbarTransitionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let transitionEndCleanup: (() => void) | null = null;

  const TOOLBAR_TRANSITION_SAFETY_MS = 400;
  let displayTables = $state.raw<SvelteMap<string, ArrowTable>>(
    new SvelteMap<string, ArrowTable>()
  );
  let displayGeoJSONs = $state.raw<SvelteMap<string, FeatureCollection>>(
    new SvelteMap<string, FeatureCollection>()
  );
  let displayDataVersion = $state(0);

  const enabledDatasets = $derived(datasetsStore.enabledDatasets);
  const duckDBDatasetsVersion = $derived(duckDBOrchestrator.datasetsVersion);
  const activeOSMBasemap = $derived(osmBasemapStore.activeOSMBasemap);
  const usesTiledBasemap = $derived(
    Boolean(activeOSMBasemap) || basemapStyleStore.requiresMapLibre
  );
  const facetsEnabled = $derived(facetsStore.enabled);
  const facetsLayout = $derived(facetsStore.layout);
  const facetVisualizations = $derived(facetsStore.facetVisualizations);
  const facetsSyncPanZoom = $derived(facetsStore.syncPanZoom);

  /** Incremented each time the main data-load $effect fires so stale async loads are discarded. */
  let loadGeneration = 0;

  function isStaleLoad(generation: number): boolean {
    return loadGeneration !== generation;
  }

  function bumpDisplayDataVersion(): void {
    displayDataVersion += 1;
  }

  function setDisplayArrowTable(datasetId: string, table: ArrowTable): void {
    const previousTable = displayTables.get(datasetId);
    const hadGeoJSON = displayGeoJSONs.has(datasetId);

    displayTables.set(datasetId, table);
    displayGeoJSONs.delete(datasetId);

    if (previousTable !== table || hadGeoJSON) {
      displayTables = new SvelteMap(displayTables);
      if (hadGeoJSON) {
        displayGeoJSONs = new SvelteMap(displayGeoJSONs);
      }
      bumpDisplayDataVersion();
    }
  }

  function setDisplayGeoJSON(
    datasetId: string,
    geoJSON: FeatureCollection
  ): void {
    const previousGeoJSON = displayGeoJSONs.get(datasetId);
    const hadTable = displayTables.has(datasetId);

    displayGeoJSONs.set(datasetId, geoJSON);
    displayTables.delete(datasetId);

    if (previousGeoJSON !== geoJSON || hadTable) {
      displayGeoJSONs = new SvelteMap(displayGeoJSONs);
      if (hadTable) {
        displayTables = new SvelteMap(displayTables);
      }
      bumpDisplayDataVersion();
    }
  }

  async function loadGeoDatasetTable(
    dataset: DatasetResult
  ): Promise<ArrowTable | FeatureCollection | null> {
    const start = performance.now();
    logger.info('Preparing dataset for map rendering', LogCategory.MAP, {
      datasetId: dataset.id,
      fileName: dataset.name,
      hasGeometry: Boolean(dataset.geometry),
      sourceFileId: dataset.sourceFileId
    });
    try {
      if (dataset.geometry && dataset.sourceFileId) {
        const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
          dataset.sourceFileId
        );
        const tableName = duckDBDataset?.tableName ?? dataset.tableName;

        if (!tableName) {
          return null;
        }

        if (!duckDBDataset) {
          logger.debug(
            'DuckDB dataset registry not ready yet, loading map table directly',
            LogCategory.MAP,
            {
              datasetId: dataset.id,
              tableName
            }
          );
        }

        if (tableName) {
          const shouldReprojectForTiledBasemap =
            usesTiledBasemap &&
            Boolean(dataset.geometry?.crs) &&
            !isWgs84LikeCrs(dataset.geometry?.crs);
          const arrowTable = shouldReprojectForTiledBasemap
            ? await duckDBOrchestrator.getArrowTableReprojectedToWGS84(
                tableName
              )
            : duckDBDataset?.arrowTableWithMetadata
              ? duckDBDataset.arrowTableWithMetadata
              : await duckDBOrchestrator.getArrowTableDirect(tableName);

          if (arrowTable) {
            logger.success('Arrow table ready for Deck.gl', LogCategory.MAP, {
              tableName,
              rows: arrowTable.numRows,
              cached: Boolean(duckDBDataset?.arrowTableWithMetadata),
              reprojectedForTiledBasemap: shouldReprojectForTiledBasemap,
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
        error instanceof Error ? error.message : m.error_loading_subtitle();
      return null;
    }
  }

  function removeDatasetFromDisplay(datasetId: string): void {
    const removedTable = displayTables.delete(datasetId);
    const removedGeoJSON = displayGeoJSONs.delete(datasetId);

    if (removedTable || removedGeoJSON) {
      if (removedTable) {
        displayTables = new SvelteMap(displayTables);
      }
      if (removedGeoJSON) {
        displayGeoJSONs = new SvelteMap(displayGeoJSONs);
      }
      bumpDisplayDataVersion();
    }
  }

  async function loadJoinedBasemap(
    dataset: DatasetResult,
    joinedBasemap: string,
    tableName: string,
    generation: number
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

      if (isStaleLoad(generation)) return;

      if (!datasetsStore.isDatasetEnabled(datasetId)) {
        logger.debug(
          'Dataset no longer enabled, ignoring joined basemap',
          LogCategory.MAP,
          { datasetId }
        );
        return;
      }

      if (joinedTable) {
        setDisplayArrowTable(datasetId, joinedTable);
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
    duckDBDatasetId: string,
    generation?: number
  ): Promise<void> {
    const start = performance.now();

    logger.info('Loading GPS data for OSM basemap', LogCategory.MAP, {
      datasetId,
      duckDBDatasetId
    });

    try {
      const { table } =
        await duckDBOrchestrator.getGPSArrowTable(duckDBDatasetId);

      if (generation !== undefined && isStaleLoad(generation)) return;

      if (!datasetsStore.isDatasetEnabled(datasetId)) {
        logger.debug(
          'Dataset no longer enabled, ignoring GPS data',
          LogCategory.MAP,
          { datasetId }
        );
        return;
      }

      if (table) {
        setDisplayArrowTable(datasetId, table);
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

  async function loadDatasetForDisplay(
    dataset: DatasetResult,
    generation: number
  ): Promise<void> {
    const datasetId = dataset.id;
    if (dataset.geometry) {
      const result = await loadGeoDatasetTable(dataset);

      if (isStaleLoad(generation)) return;

      if (!datasetsStore.isDatasetEnabled(datasetId)) {
        return;
      }

      if (result) {
        if ('numRows' in result) {
          setDisplayArrowTable(datasetId, result);
          logger.info(
            'Dataset added to display as Arrow table',
            LogCategory.MAP,
            {
              datasetId,
              rows: result.numRows
            }
          );
        } else if ('features' in result) {
          setDisplayGeoJSON(datasetId, result);
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
        await loadGPSData(datasetId, duckDBDataset.id, generation);
      } else if (duckDBDataset?.joinedBasemap && duckDBDataset.tableName) {
        await loadJoinedBasemap(
          dataset,
          duckDBDataset.joinedBasemap,
          duckDBDataset.tableName,
          generation
        );
      }
    }
  }

  $effect(() => {
    const version = duckDBDatasetsVersion;
    const currentEnabledDatasets = enabledDatasets;

    if (isInitializing) {
      return;
    }

    hasError = false;
    errorMessage = null;

    const currentEnabledIds = new Set(currentEnabledDatasets.map((d) => d.id));

    // displayTables/displayGeoJSONs are outputs of this effect.
    // Read them untracked to avoid a self-triggering reload loop.
    const tableIdsToRemove = untrack(() =>
      [...displayTables.keys()].filter((id) => !currentEnabledIds.has(id))
    );

    const geojsonIdsToRemove = untrack(() =>
      [...displayGeoJSONs.keys()].filter((id) => !currentEnabledIds.has(id))
    );

    const datasetIdsToRemove = new Set([
      ...tableIdsToRemove,
      ...geojsonIdsToRemove
    ]);
    for (const datasetId of datasetIdsToRemove) {
      removeDatasetFromDisplay(datasetId);
    }

    // Bump load generation so any in-flight loads from a previous version are discarded
    const thisGeneration = ++loadGeneration;

    untrack(() => {
      logger.debug(
        'Reloading display data for enabled datasets',
        LogCategory.MAP,
        {
          version,
          datasetCount: currentEnabledDatasets.length,
          generation: thisGeneration
        }
      );

      void loadDatasetsSequentially(currentEnabledDatasets, (dataset) =>
        loadDatasetForDisplay(dataset, thisGeneration)
      ).catch((error) => {
        logger.error(
          'Failed to reload display datasets',
          LogCategory.MAP,
          error
        );
      });
    });
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

  function cleanupTransitionListener(): void {
    if (transitionEndCleanup) {
      transitionEndCleanup();
      transitionEndCleanup = null;
    }
  }

  function finishToolbarTransition(): void {
    cleanupTransitionListener();
    if (toolbarTransitionTimeoutId) {
      clearTimeout(toolbarTransitionTimeoutId);
      toolbarTransitionTimeoutId = null;
    }
    globalState.isToolbarTransitioning = false;
  }

  $effect(() => {
    void globalState.toolbarState;

    untrack(() => {
      if (!isMapReady) return;

      globalState.isToolbarTransitioning = true;

      // Clean up previous transition tracking
      cleanupTransitionListener();
      if (toolbarTransitionTimeoutId) {
        clearTimeout(toolbarTransitionTimeoutId);
      }

      // Safety timeout in case transitionend never fires
      toolbarTransitionTimeoutId = setTimeout(
        finishToolbarTransition,
        TOOLBAR_TRANSITION_SAFETY_MS
      );

      // Listen for CSS transition end on the toolbar element
      const toolbar = document.getElementById('khartis-main-toolbar');
      if (toolbar) {
        const handler = (event: TransitionEvent) => {
          if (event.propertyName === 'width') {
            finishToolbarTransition();
          }
        };
        toolbar.addEventListener(EVENT.TRANSITIONEND, handler, { once: true });
        transitionEndCleanup = () =>
          toolbar.removeEventListener(EVENT.TRANSITIONEND, handler);
      }
    });
  });

  async function initializeMap() {
    const start = performance.now();
    logger.info('Initializing main map view', LogCategory.MAP, {
      enabledCount: enabledDatasets.length
    });

    const initGeneration = ++loadGeneration;
    const [firstDataset, ...remainingDatasets] = enabledDatasets;

    // Load the first dataset and unblock rendering immediately
    if (firstDataset) {
      await loadDatasetForDisplay(firstDataset, initGeneration);
    }

    logger.success(
      'First dataset ready, unblocking map render',
      LogCategory.MAP,
      {
        durationMs: (performance.now() - start).toFixed(2),
        tablesLoaded: displayTables.size,
        geoJSONsLoaded: displayGeoJSONs.size
      }
    );
    isInitializing = false;

    // Force a layer update now that data + viz state are both available.
    bumpDisplayDataVersion();

    // Load remaining datasets progressively in the background
    if (remainingDatasets.length > 0) {
      void loadDatasetsSequentially(remainingDatasets, (dataset) =>
        loadDatasetForDisplay(dataset, initGeneration)
      )
        .then(() => {
          logger.success('All datasets loaded', LogCategory.MAP, {
            durationMs: (performance.now() - start).toFixed(2),
            tablesLoaded: displayTables.size,
            geoJSONsLoaded: displayGeoJSONs.size
          });
        })
        .catch((error) => {
          logger.error(
            'Failed to load remaining datasets',
            LogCategory.MAP,
            error
          );
        });
    }
  }

  onMount(() => {
    initializeMap();

    return () => {
      if (toolbarTransitionTimeoutId) {
        clearTimeout(toolbarTransitionTimeoutId);
      }
      if (skeletonTimeoutId) {
        clearTimeout(skeletonTimeoutId);
      }
      cleanupTransitionListener();
      handleResizeUp();
    };
  });

  const MIN_SKELETON_DISPLAY_MS = 1000;
  let skeletonTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function handleMapReady() {
    logger.success('Map fully rendered', LogCategory.MAP);
    const elapsed = Date.now() - skeletonShownAt;
    const remaining = Math.max(0, MIN_SKELETON_DISPLAY_MS - elapsed);
    if (remaining === 0) {
      isMapReady = true;
    } else {
      skeletonTimeoutId = setTimeout(() => {
        skeletonTimeoutId = null;
        isMapReady = true;
      }, remaining);
    }
  }

  const colorBlindnessState = $derived(getColorBlindnessState());

  $effect(() => {
    const simulationType = colorBlindnessState.enabled
      ? colorBlindnessState.simulationType
      : ColorBlindnessType.NONE;
    if (thematicMapRef) {
      applyColorBlindnessFilter(thematicMapRef, simulationType);
    }
  });

  // --- Resize handles for styling step ---
  type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  const RESIZE_EDGES: ResizeEdge[] = [
    'n',
    's',
    'e',
    'w',
    'ne',
    'nw',
    'se',
    'sw'
  ];
  const MIN_MAP_SIZE = 100;

  const showResizeHandles = $derived(
    globalState.selectedStep === ToolbarStep.Styling && isMapReady
  );
  let hoveredResizeEdge = $state<ResizeEdge | null>(null);

  let resizeState = $state<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  function handleResizePointerDown(
    event: PointerEvent,
    edge: ResizeEdge
  ): void {
    event.preventDefault();
    event.stopPropagation();
    resizeState = {
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startW: formatState.width,
      startH: formatState.height
    };
    formatActions.setMode(FormatMode.CUSTOM);
    window.addEventListener(EVENT.POINTERMOVE, handleResizeMove);
    window.addEventListener(EVENT.POINTERUP, handleResizeUp);
  }

  function handleResizeMove(event: PointerEvent): void {
    if (!resizeState) return;
    const { edge, startX, startY, startW, startH } = resizeState;
    const scale = globalState.zoom.pageZoomLevel / 100;
    const dx = (event.clientX - startX) / scale;
    const dy = (event.clientY - startY) / scale;

    let newW = startW;
    let newH = startH;

    if (edge.includes('e')) newW = startW + dx;
    if (edge.includes('w')) newW = startW - dx;
    if (edge.includes('s')) newH = startH + dy;
    if (edge.includes('n')) newH = startH - dy;

    formatActions.setSize(
      Math.max(MIN_MAP_SIZE, Math.round(newW)),
      Math.max(MIN_MAP_SIZE, Math.round(newH))
    );
  }

  function handleResizeUp(): void {
    resizeState = null;
    hoveredResizeEdge = null;
    window.removeEventListener(EVENT.POINTERMOVE, handleResizeMove);
    window.removeEventListener(EVENT.POINTERUP, handleResizeUp);
  }
</script>

<div class="main-map-container" class:resizable={showResizeHandles}>
  <!-- Skeleton loader - overlay above map, hidden via CSS when ready -->
  <div
    class="skeleton-loader"
    class:hidden={isMapReady}
    style="width: {formatState.width}px; height: {formatState.height}px;"
  >
    <MapSkeleton paused={isMapReady} />
  </div>

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
      {#if facetsEnabled && facetVisualizations.length > 0}
        <FacetsGrid
          visualizations={facetVisualizations}
          tables={displayTables}
          geoJSONs={displayGeoJSONs}
          layout={facetsLayout}
          syncPanZoom={facetsSyncPanZoom}
          containerWidth={formatState.width}
          containerHeight={formatState.height}
        />
      {:else}
        <ThematicMap
          tables={displayTables}
          geoJSONs={displayGeoJSONs}
          dataVersion={displayDataVersion}
          width={formatState.width}
          height={formatState.height}
          onReady={handleMapReady}
        />
      {/if}
    </div>
  {/if}

  {#if showResizeHandles}
    <div
      class="resize-handles-frame"
      class:highlighted={hoveredResizeEdge !== null || resizeState !== null}
      style="width: {formatState.width}px; height: {formatState.height}px;"
    >
      {#each RESIZE_EDGES as edge (edge)}
        <div
          class="resize-handle resize-{edge}"
          role="separator"
          aria-orientation={edge === 'n' || edge === 's'
            ? 'horizontal'
            : 'vertical'}
          onpointerenter={() => (hoveredResizeEdge = edge)}
          onpointerleave={() => {
            if (hoveredResizeEdge === edge) {
              hoveredResizeEdge = null;
            }
          }}
          onpointerdown={(e: PointerEvent) => handleResizePointerDown(e, edge)}
        ></div>
      {/each}
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
    overflow: visible;
  }

  .main-map-container.resizable {
    user-select: none;
  }

  .thematic-map-wrapper {
    opacity: 0;
    transition: opacity 0.3s ease-out;
    position: relative;
  }

  .thematic-map-wrapper.visible {
    opacity: 1;
  }

  .skeleton-loader {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: var(--z-content);
    overflow: hidden;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    border-radius: 2px;
    opacity: 1;
    transition: opacity 0.3s cubic-bezier(0.33, 1, 0.68, 1);
  }

  .skeleton-loader.hidden {
    opacity: 0;
    pointer-events: none;
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

  /* --- Resize handles --- */
  .resize-handles-frame {
    position: absolute;
    pointer-events: none;
    border: 1px dashed transparent;
    border-radius: 2px;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .resize-handles-frame.highlighted {
    border-color: rgba(15, 98, 254, 0.55);
    box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.15);
  }

  .resize-handle {
    position: absolute;
    pointer-events: auto;
    z-index: var(--z-content-raised, 2);
    touch-action: none;
  }

  /* Edge handles — thin bars along each side */
  .resize-n {
    top: -3px;
    left: 8px;
    right: 8px;
    height: 6px;
    cursor: n-resize;
  }

  .resize-s {
    bottom: -3px;
    left: 8px;
    right: 8px;
    height: 6px;
    cursor: s-resize;
  }

  .resize-e {
    right: -3px;
    top: 8px;
    bottom: 8px;
    width: 6px;
    cursor: e-resize;
  }

  .resize-w {
    left: -3px;
    top: 8px;
    bottom: 8px;
    width: 6px;
    cursor: w-resize;
  }

  /* Corner handles — small squares */
  .resize-ne {
    top: -4px;
    right: -4px;
    width: 8px;
    height: 8px;
    cursor: ne-resize;
  }

  .resize-nw {
    top: -4px;
    left: -4px;
    width: 8px;
    height: 8px;
    cursor: nw-resize;
  }

  .resize-se {
    bottom: -4px;
    right: -4px;
    width: 8px;
    height: 8px;
    cursor: se-resize;
  }

  .resize-sw {
    bottom: -4px;
    left: -4px;
    width: 8px;
    height: 8px;
    cursor: sw-resize;
  }

  /* Visual indicator on hover */
  .resize-handle:hover {
    background: var(--cds-interactive-01, #0f62fe);
    opacity: 0.4;
    border-radius: 1px;
  }
</style>
