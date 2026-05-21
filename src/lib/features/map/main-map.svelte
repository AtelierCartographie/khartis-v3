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
  import { datasetsStore } from '../commons/stores/datasets.store.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { isWgs84LikeCrs } from './utils/dataset-crs.utils';
  import { globalActions, globalState } from '../commons/stores/global.svelte';
  import { ToolbarStep } from '../commons/types/global';
  import { LogCategory, logger } from '../commons/utils/logger';
  import { FormatMode } from '../commons/constants/ui.constants';
  import {
    formatActions,
    formatState
  } from '$lib/features/step-toolbar/tools/format';
  import { EVENT } from '../commons/constants/dom.constants';
  import MapSkeleton from './components/map-skeleton.svelte';
  import ThematicMap from './components/thematic-map.svelte';
  import { osmBasemapStore } from './stores/osm-basemap.store.svelte';
  import { facetsStore } from '$lib/features/step-toolbar/tools/facets';
  import FacetsPage from '$lib/features/step-toolbar/tools/facets/facets-page.svelte';
  import { loadDatasetsSequentially } from './utils/load-datasets-sequentially.utils';
  import { resolveWorkspaceFitScale } from '../commons/utils/workspace-viewport.utils';
  import {
    getPolygonPrimitive,
    visualizationStore,
    type VisualizationConfig
  } from '../commons/stores/visualization.store.svelte';
  import { FillMode } from '$lib/features/commons/constants/visualization.constants';
  import { densityLoadingStore } from './stores/density-loading.store.svelte';
  import { mapLoadingStore } from './stores/map-loading.store.svelte';
  import { basemapService } from './services/basemap.service.svelte';
  import type { SplitRenderingTable } from './types';
  import { INTERNAL_COLUMN } from '../commons/constants/data.constants';
  import { shouldUseMapLibreInterleaved } from './utils/render-engine.utils';
  import { resolveMapDisplayDatasets } from './utils/map-display-datasets.utils';
  import { resolveBestSplitFeatureIdColumn } from './layers/split-rendering-accessors';

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
  let displayDensityTables = $state.raw<SvelteMap<string, ArrowTable>>(
    new SvelteMap<string, ArrowTable>()
  );
  let displayGeoJSONs = $state.raw<SvelteMap<string, FeatureCollection>>(
    new SvelteMap<string, FeatureCollection>()
  );
  let displaySplitData = $state.raw<SvelteMap<string, SplitRenderingTable>>(
    new SvelteMap<string, SplitRenderingTable>()
  );
  let displayDataVersion = $state(0);

  const enabledDatasets = $derived(datasetsStore.enabledDatasets);
  const mapDisplayDatasets = $derived.by(() =>
    resolveMapDisplayDatasets({
      allDatasets: datasetsStore.datasets,
      enabledDatasets,
      activeVisualizations: visualizationStore.activeVisualizations,
      selectedStep: globalState.selectedStep
    })
  );
  const duckDBDatasetsVersion = $derived(duckDBOrchestrator.datasetsVersion);
  const activeOSMBasemap = $derived(osmBasemapStore.activeOSMBasemap);

  let showDensityLoader = $state(false);
  let showReferenceBasemapLoader = $state(false);
  $effect(() => {
    if (!densityLoadingStore.isLoading) {
      showDensityLoader = false;
      return;
    }
    const timer = setTimeout(() => {
      showDensityLoader = densityLoadingStore.isLoading;
    }, 300);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    if (!mapLoadingStore.isReferenceBasemapLoading) {
      showReferenceBasemapLoader = false;
      return;
    }
    const timer = setTimeout(() => {
      showReferenceBasemapLoader = mapLoadingStore.isReferenceBasemapLoading;
    }, 300);
    return () => clearTimeout(timer);
  });
  const showMapStatusLoader = $derived(
    showReferenceBasemapLoader || showDensityLoader
  );
  const mapStatusLoaderText = $derived(
    showReferenceBasemapLoader ? m.basemap_loading() : m.density_loading()
  );
  const usesTiledBasemap = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: Boolean(activeOSMBasemap)
    })
  );
  const shouldHideMapOutput = $derived(
    mapLoadingStore.isHoldingPreviewForSuggestedBasemap
  );
  const densityReloadSignature = $derived.by(() =>
    visualizationStore.activeVisualizations
      .map((viz) => {
        const polygon = getPolygonPrimitive(viz);
        const density = viz.density;
        if (polygon?.fillMode !== FillMode.DENSITY || !density) {
          return null;
        }

        return [
          viz.id,
          viz.datasetId,
          density.valueColumn ?? '',
          density.ratio ?? '',
          density.seed ?? ''
        ].join(':');
      })
      .filter((value): value is string => value !== null)
      .join('|')
  );
  const facetsEnabled = $derived(facetsStore.enabled);
  const facetsLayout = $derived(facetsStore.layout);
  const facetVisualizations = $derived(facetsStore.facetVisualizations);

  let loadGeneration = 0;
  const WORKSPACE_FIT_PADDING_PX = 30;
  const STYLING_STEP_COVERAGE_RATIO = 0.85;
  const DEFAULT_STEP_COVERAGE_RATIO = 1;
  let responsiveMapResizeObserver: ResizeObserver | null = null;
  let workspaceWidth = $state(0);
  let workspaceHeight = $state(0);
  let stepToolbarWidth = $state(0);

  const fitCoverageRatio = $derived(
    globalState.selectedStep === ToolbarStep.Styling &&
      !globalState.isMobileView
      ? STYLING_STEP_COVERAGE_RATIO
      : DEFAULT_STEP_COVERAGE_RATIO
  );

  const fitScale = $derived(
    resolveWorkspaceFitScale({
      viewportWidth: workspaceWidth,
      viewportHeight: workspaceHeight,
      pageWidth: formatState.width,
      pageHeight: formatState.height,
      paddingPx: WORKSPACE_FIT_PADDING_PX,
      reservedInlineStartPx: globalState.isMobileView ? 0 : stepToolbarWidth,
      maxViewportCoverageRatio: fitCoverageRatio
    })
  );
  const renderedPageScale = $derived(
    fitScale * (globalState.zoom.pageZoomLevel / 100)
  );
  const renderedPageWidth = $derived(
    Math.max(1, Math.round(formatState.width * renderedPageScale))
  );
  const renderedPageHeight = $derived(
    Math.max(1, Math.round(formatState.height * renderedPageScale))
  );

  function updateResponsiveMapBounds(): void {
    const workspace = document.querySelector('.workspace-viewport');
    const stepToolbar = document.getElementById('khartis-step-toolbar');

    workspaceWidth =
      workspace instanceof HTMLElement ? workspace.clientWidth : 0;
    workspaceHeight =
      workspace instanceof HTMLElement ? workspace.clientHeight : 0;
    stepToolbarWidth =
      stepToolbar instanceof HTMLElement
        ? Math.round(stepToolbar.getBoundingClientRect().width)
        : 0;
  }

  function startResponsiveMapObservers(): void {
    const workspace = document.querySelector('.workspace-viewport');
    const stepToolbar = document.getElementById('khartis-step-toolbar');

    if (typeof ResizeObserver !== 'undefined') {
      responsiveMapResizeObserver = new ResizeObserver(() => {
        updateResponsiveMapBounds();
      });

      if (workspace instanceof HTMLElement) {
        responsiveMapResizeObserver.observe(workspace);
      }
      if (stepToolbar instanceof HTMLElement) {
        responsiveMapResizeObserver.observe(stepToolbar);
      }
    }

    window.addEventListener(EVENT.RESIZE, updateResponsiveMapBounds);
    updateResponsiveMapBounds();
  }

  function stopResponsiveMapObservers(): void {
    responsiveMapResizeObserver?.disconnect();
    responsiveMapResizeObserver = null;
    window.removeEventListener(EVENT.RESIZE, updateResponsiveMapBounds);
  }

  function isStaleLoad(generation: number): boolean {
    return loadGeneration !== generation;
  }

  function isMissingDuckTableError(error: unknown): boolean {
    return (
      error instanceof Error &&
      /Catalog Error:\s*Table with name .*?(does not exist|not found)/i.test(
        error.message
      )
    );
  }

  function shouldIgnoreDatasetLoadError(
    datasetId: string,
    generation: number,
    error: unknown,
    tableName?: string
  ): boolean {
    if (isStaleLoad(generation) || !isDatasetExpectedForDisplay(datasetId)) {
      return true;
    }

    if (!tableName || !isMissingDuckTableError(error)) {
      return false;
    }

    return !duckDBOrchestrator.getDatasetByTable(tableName);
  }

  function isDatasetExpectedForDisplay(datasetId: string): boolean {
    return mapDisplayDatasets.some((dataset) => dataset.id === datasetId);
  }

  function bumpDisplayDataVersion(): void {
    displayDataVersion += 1;
  }

  function setDisplayArrowTable(datasetId: string, table: ArrowTable): void {
    const previousTable = displayTables.get(datasetId);
    const hadGeoJSON = displayGeoJSONs.has(datasetId);
    const hadSplit = displaySplitData.has(datasetId);

    displayTables.set(datasetId, table);
    displayGeoJSONs.delete(datasetId);
    displaySplitData.delete(datasetId);

    if (previousTable !== table || hadGeoJSON || hadSplit) {
      displayTables = new SvelteMap(displayTables);
      if (hadGeoJSON) {
        displayGeoJSONs = new SvelteMap(displayGeoJSONs);
      }
      if (hadSplit) {
        displaySplitData = new SvelteMap(displaySplitData);
      }
      bumpDisplayDataVersion();
    }
  }

  function setDisplayDensityTable(datasetId: string, table: ArrowTable): void {
    const previousTable = displayDensityTables.get(datasetId);
    displayDensityTables.set(datasetId, table);

    if (previousTable !== table) {
      displayDensityTables = new SvelteMap(displayDensityTables);
      bumpDisplayDataVersion();
    }
  }

  function setDisplaySplitTable(
    datasetId: string,
    split: SplitRenderingTable
  ): void {
    const previousSplit = displaySplitData.get(datasetId);
    const hadGeoJSON = displayGeoJSONs.has(datasetId);

    displaySplitData.set(datasetId, split);

    displayTables.set(datasetId, split.geometry);
    displayGeoJSONs.delete(datasetId);

    if (
      previousSplit?.geometry !== split.geometry ||
      previousSplit?.dataset !== split.dataset ||
      previousSplit?.featureIdColumn !== split.featureIdColumn ||
      hadGeoJSON
    ) {
      displaySplitData = new SvelteMap(displaySplitData);
      displayTables = new SvelteMap(displayTables);
      if (hadGeoJSON) {
        displayGeoJSONs = new SvelteMap(displayGeoJSONs);
      }
      bumpDisplayDataVersion();
    }
  }

  function detectFeatureIdColumn(
    geometry: ArrowTable,
    dataset?: ArrowTable
  ): string {
    if (dataset) {
      const matchedColumn = resolveBestSplitFeatureIdColumn(
        geometry,
        dataset,
        INTERNAL_COLUMN.FEATURE_ID
      );
      if (matchedColumn) {
        return matchedColumn;
      }
    }

    const fields = geometry.schema.fields ?? [];
    if (fields.some((f) => f.name === INTERNAL_COLUMN.FEATURE_ID)) {
      return INTERNAL_COLUMN.FEATURE_ID;
    }
    if (fields.some((f) => f.name.toLowerCase() === 'id')) {
      const match = fields.find((f) => f.name.toLowerCase() === 'id');
      return match?.name ?? 'id';
    }
    return INTERNAL_COLUMN.FEATURE_ID;
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

  function removeDensityTable(datasetId: string): void {
    if (displayDensityTables.delete(datasetId)) {
      displayDensityTables = new SvelteMap(displayDensityTables);
      bumpDisplayDataVersion();
    }
  }

  async function loadGeoDatasetTable(
    dataset: DatasetResult,
    generation: number
  ): Promise<ArrowTable | FeatureCollection | null> {
    const start = performance.now();
    let tableName: string | undefined;
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
        tableName = duckDBDataset?.tableName ?? dataset.tableName;

        if (!tableName) {
          return null;
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
      if (
        shouldIgnoreDatasetLoadError(dataset.id, generation, error, tableName)
      ) {
        return null;
      }

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
    const removedDensityTable = displayDensityTables.delete(datasetId);
    const removedGeoJSON = displayGeoJSONs.delete(datasetId);
    const removedSplit = displaySplitData.delete(datasetId);

    if (removedTable || removedDensityTable || removedGeoJSON || removedSplit) {
      if (removedTable) {
        displayTables = new SvelteMap(displayTables);
      }
      if (removedDensityTable) {
        displayDensityTables = new SvelteMap(displayDensityTables);
      }
      if (removedGeoJSON) {
        displayGeoJSONs = new SvelteMap(displayGeoJSONs);
      }
      if (removedSplit) {
        displaySplitData = new SvelteMap(displaySplitData);
      }
      bumpDisplayDataVersion();
    }
  }

  function findActiveDensityViz(datasetId: string): VisualizationConfig | null {
    const matches: VisualizationConfig[] = [];
    for (const viz of visualizationStore.activeVisualizations) {
      if (viz.datasetId !== datasetId) continue;
      if (getPolygonPrimitive(viz)?.fillMode !== FillMode.DENSITY) continue;
      if (!viz.density?.valueColumn || !viz.density?.ratio) continue;
      matches.push(viz);
    }
    if (matches.length > 1) {
      logger.warn(
        'Multiple density visualizations on the same dataset — rendering only the first one',
        LogCategory.MAP,
        { datasetId, count: matches.length }
      );
    }
    return matches[0] ?? null;
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
      const [geometryArrow, datasetArrow] = await Promise.all([
        basemapService.getBasemapGeometryArrow(joinedBasemap),
        duckDBOrchestrator.getArrowTableDirect(tableName)
      ]);

      if (isStaleLoad(generation)) return;
      if (!isDatasetExpectedForDisplay(datasetId)) return;

      if (geometryArrow && datasetArrow) {
        const featureIdColumn = detectFeatureIdColumn(
          geometryArrow,
          datasetArrow
        );
        setDisplaySplitTable(datasetId, {
          geometry: geometryArrow,
          dataset: datasetArrow,
          featureIdColumn
        });
        logger.success(
          'Split joined basemap ready for rendering',
          LogCategory.MAP,
          {
            datasetId,
            geomRows: geometryArrow.numRows,
            datasetRows: datasetArrow.numRows,
            featureIdColumn,
            durationMs: (performance.now() - start).toFixed(2)
          }
        );
        return;
      }

      const joinedTable = await duckDBOrchestrator.getJoinedArrowTable(
        tableName,
        joinedBasemap
      );

      if (isStaleLoad(generation)) return;

      if (!isDatasetExpectedForDisplay(datasetId)) {
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

  async function loadDensityTableForDisplay(
    dataset: DatasetResult,
    generation: number
  ): Promise<void> {
    const densityViz = findActiveDensityViz(dataset.id);

    if (!densityViz?.density?.valueColumn || !densityViz.density?.ratio) {
      removeDensityTable(dataset.id);
      return;
    }

    let tableName: string | undefined;

    densityLoadingStore.begin();
    try {
      let densityTable: ArrowTable | undefined;

      if (dataset.geometry && dataset.sourceFileId) {
        const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
          dataset.sourceFileId
        );
        tableName = duckDBDataset?.tableName ?? dataset.tableName;

        if (tableName) {
          densityTable =
            await duckDBOrchestrator.generateDotDensityArrowFromGeoTable(
              tableName,
              densityViz.density.valueColumn,
              densityViz.density.ratio,
              densityViz.density.seed !== undefined
                ? { seed: densityViz.density.seed }
                : undefined
            );
        }
      } else if (dataset.sourceFileId) {
        const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
          dataset.sourceFileId
        );
        tableName = duckDBDataset?.tableName;

        if (
          duckDBDataset?.gpsMode &&
          duckDBDataset.gpsColumns &&
          duckDBDataset.joinedBasemap &&
          duckDBDataset.tableName
        ) {
          densityTable =
            await duckDBOrchestrator.generateDotDensityArrowFromGpsJoin(
              duckDBDataset.joinedBasemap,
              duckDBDataset.tableName,
              densityViz.density.valueColumn,
              duckDBDataset.gpsColumns,
              densityViz.density.ratio,
              densityViz.density.seed !== undefined
                ? { seed: densityViz.density.seed }
                : undefined
            );
        } else if (duckDBDataset?.joinedBasemap && duckDBDataset.tableName) {
          densityTable =
            await duckDBOrchestrator.generateDotDensityArrowFromJoin(
              duckDBDataset.joinedBasemap,
              duckDBDataset.tableName,
              densityViz.density.valueColumn,
              densityViz.density.ratio,
              densityViz.density.seed !== undefined
                ? { seed: densityViz.density.seed }
                : undefined
            );
        }
      }

      if (isStaleLoad(generation)) return;
      if (!isDatasetExpectedForDisplay(dataset.id)) return;

      if (densityTable) {
        setDisplayDensityTable(dataset.id, densityTable);
        logger.success('Density points ready for Deck.gl', LogCategory.MAP, {
          datasetId: dataset.id,
          rows: densityTable.numRows
        });
      } else {
        removeDensityTable(dataset.id);
      }
    } catch (error) {
      if (
        (tableName &&
          shouldIgnoreDatasetLoadError(
            dataset.id,
            generation,
            error,
            tableName
          )) ||
        isStaleLoad(generation) ||
        !isDatasetExpectedForDisplay(dataset.id)
      ) {
        return;
      }

      logger.error('Failed to load density table', LogCategory.MAP, error);
      removeDensityTable(dataset.id);
    } finally {
      densityLoadingStore.end();
    }
  }

  async function loadGPSData(
    datasetId: string,
    duckDBDatasetId: string,
    generation?: number
  ): Promise<void> {
    const start = performance.now();
    const datasetTableName =
      duckDBOrchestrator.getDatasetById(duckDBDatasetId)?.tableName;

    logger.info('Loading GPS data for OSM basemap', LogCategory.MAP, {
      datasetId,
      duckDBDatasetId
    });

    try {
      const { table } =
        await duckDBOrchestrator.getGPSArrowTable(duckDBDatasetId);

      if (generation !== undefined && isStaleLoad(generation)) return;

      if (!isDatasetExpectedForDisplay(datasetId)) {
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
      if (
        (generation !== undefined &&
          shouldIgnoreDatasetLoadError(
            datasetId,
            generation,
            error,
            datasetTableName
          )) ||
        (!isDatasetExpectedForDisplay(datasetId) &&
          isMissingDuckTableError(error)) ||
        (datasetTableName &&
          isMissingDuckTableError(error) &&
          !duckDBOrchestrator.getDatasetByTable(datasetTableName))
      ) {
        return;
      }

      if (isMissingDuckTableError(error)) {
        removeDatasetFromDisplay(datasetId);
        return;
      }

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
      const result = await loadGeoDatasetTable(dataset, generation);

      if (isStaleLoad(generation)) return;

      if (!isDatasetExpectedForDisplay(datasetId)) {
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

      await loadDensityTableForDisplay(dataset, generation);
    } else {
      const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
        dataset.sourceFileId
      );

      if (duckDBDataset?.gpsMode && duckDBDataset.gpsColumns) {
        await loadGPSData(datasetId, duckDBDataset.id, generation);
        await loadDensityTableForDisplay(dataset, generation);
      } else if (duckDBDataset?.joinedBasemap && duckDBDataset.tableName) {
        await loadJoinedBasemap(
          dataset,
          duckDBDataset.joinedBasemap,
          duckDBDataset.tableName,
          generation
        );
        await loadDensityTableForDisplay(dataset, generation);
      } else {
        removeDensityTable(datasetId);
      }
    }
  }

  let pendingReloadHandle: number | null = null;

  $effect(() => {
    void duckDBDatasetsVersion;
    void densityReloadSignature;
    void basemapService.simplificationVersion;
    const currentMapDisplayDatasets = mapDisplayDatasets;

    if (isInitializing) {
      return;
    }

    if (pendingReloadHandle !== null) {
      cancelAnimationFrame(pendingReloadHandle);
    }

    pendingReloadHandle = requestAnimationFrame(() => {
      pendingReloadHandle = null;
      untrack(() => {
        hasError = false;
        errorMessage = null;

        const currentMapDisplayIds = new Set(
          currentMapDisplayDatasets.map((d) => d.id)
        );

        const tableIdsToRemove = [...displayTables.keys()].filter(
          (id) => !currentMapDisplayIds.has(id)
        );
        const geojsonIdsToRemove = [...displayGeoJSONs.keys()].filter(
          (id) => !currentMapDisplayIds.has(id)
        );

        const datasetIdsToRemove = new Set([
          ...tableIdsToRemove,
          ...geojsonIdsToRemove
        ]);
        for (const datasetId of datasetIdsToRemove) {
          removeDatasetFromDisplay(datasetId);
        }

        const thisGeneration = ++loadGeneration;
        void loadDatasetsSequentially(currentMapDisplayDatasets, (dataset) =>
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

    return () => {
      if (pendingReloadHandle !== null) {
        cancelAnimationFrame(pendingReloadHandle);
        pendingReloadHandle = null;
      }
    };
  });

  $effect(() => {
    const osmBasemap = activeOSMBasemap;
    if (isInitializing || !osmBasemap) {
      return;
    }

    const thisGeneration = ++loadGeneration;

    for (const dataset of mapDisplayDatasets) {
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
        loadGPSData(dataset.id, duckDBDataset.id, thisGeneration);
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

      cleanupTransitionListener();
      if (toolbarTransitionTimeoutId) {
        clearTimeout(toolbarTransitionTimeoutId);
      }

      toolbarTransitionTimeoutId = setTimeout(
        finishToolbarTransition,
        TOOLBAR_TRANSITION_SAFETY_MS
      );

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
      displayDatasetCount: mapDisplayDatasets.length
    });

    const initGeneration = ++loadGeneration;
    const [firstDataset, ...remainingDatasets] = mapDisplayDatasets;

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

    bumpDisplayDataVersion();

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
    startResponsiveMapObservers();
    initializeMap();

    return () => {
      if (toolbarTransitionTimeoutId) {
        clearTimeout(toolbarTransitionTimeoutId);
      }
      if (skeletonTimeoutId) {
        clearTimeout(skeletonTimeoutId);
      }
      cleanupTransitionListener();
      stopResponsiveMapObservers();
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

  $effect(() => {
    globalActions.setPageZoomScale(renderedPageScale);
  });

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
    const scale = Math.max(globalState.zoom.pageZoomScale, 0.1);
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
    class:hidden={isMapReady && !shouldHideMapOutput}
    class:held={shouldHideMapOutput}
    style="width: {renderedPageWidth}px; height: {renderedPageHeight}px;"
  >
    <MapSkeleton paused={isMapReady && !shouldHideMapOutput} />
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
      class:held={shouldHideMapOutput}
      class:visible={isMapReady && !shouldHideMapOutput}
      bind:this={thematicMapRef}
    >
      {#if facetsEnabled && facetVisualizations.length > 0}
        <FacetsPage
          visualizations={facetVisualizations}
          tables={displayTables}
          densityTables={displayDensityTables}
          splitData={displaySplitData}
          geoJSONs={displayGeoJSONs}
          layout={facetsLayout}
          width={renderedPageWidth}
          height={renderedPageHeight}
          logicalWidth={formatState.width}
          logicalHeight={formatState.height}
          displayScale={renderedPageScale}
          onReady={handleMapReady}
        />
      {:else}
        <ThematicMap
          tables={displayTables}
          densityTables={displayDensityTables}
          splitData={displaySplitData}
          geoJSONs={displayGeoJSONs}
          dataVersion={displayDataVersion}
          width={renderedPageWidth}
          height={renderedPageHeight}
          logicalWidth={formatState.width}
          logicalHeight={formatState.height}
          displayScale={renderedPageScale}
          onReady={handleMapReady}
        />
      {/if}
      {#if showMapStatusLoader}
        <div
          class="map-status-loader"
          role="status"
          aria-live="polite"
          transition:fade={{ duration: 150 }}
        >
          <span class="map-status-loader-spinner" aria-hidden="true"></span>
          <span class="map-status-loader-text">{mapStatusLoaderText}</span>
        </div>
      {/if}
    </div>
  {/if}

  {#if showResizeHandles}
    <div
      class="resize-handles-frame"
      class:highlighted={hoveredResizeEdge !== null || resizeState !== null}
      style="width: {renderedPageWidth}px; height: {renderedPageHeight}px;"
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
  .map-status-loader {
    position: absolute;
    top: var(--cds-spacing-04);
    right: var(--cds-spacing-04);
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-02) var(--cds-spacing-04);
    background: var(--cds-layer-01, rgba(255, 255, 255, 0.95));
    border: 1px solid var(--cds-border-subtle-01, #e0e0e0);
    border-radius: 999px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
    pointer-events: none;
    z-index: 3;
  }

  .map-status-loader-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--cds-border-subtle-02, #c6c6c6);
    border-top-color: var(--cds-interactive-01, #0f62fe);
    border-radius: 50%;
    animation: map-status-loader-spin 0.75s linear infinite;
  }

  @keyframes map-status-loader-spin {
    to {
      transform: rotate(360deg);
    }
  }

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
    position: relative;
  }

  .thematic-map-wrapper.visible {
    opacity: 1;
    transition: none;
  }

  .thematic-map-wrapper.held {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: none;
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

  .skeleton-loader.held {
    opacity: 1;
    visibility: visible;
    transition: none;
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
