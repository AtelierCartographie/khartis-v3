import type { DatasetResult } from '$lib/features/data-pipeline';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { isMissingDuckTableError } from '$lib/features/duckdb/utils/duckdb-error.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { FillMode } from '$lib/features/commons/constants/visualization.constants';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { globalState } from '$lib/features/commons/stores/global.svelte';
import {
  ALL_PRIMITIVE_FILTERS,
  getPolygonPrimitive,
  getPrimitiveSizeColumn,
  getPrimitiveValueColumn,
  visualizationStore,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { getProjectionState } from '$lib/features/step-toolbar/tools/projections';
import * as m from '$lib/paraglide/messages';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { basemapService } from '../services/basemap.service.svelte';
import { densityLoadingStore } from '../stores/density-loading.store.svelte';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import {
  rowScopeStore,
  type RowScopeTarget
} from '../stores/row-scope.store.svelte';
import type { SplitRenderingTable } from '../types';
import { resolveBestSplitFeatureIdColumn } from '../layers/split-rendering-accessors';
import {
  isWgs84LikeCrs,
  shouldReprojectDatasetForActiveProjection
} from '../utils/dataset-crs.utils';
import { loadDatasetsSequentially } from '../utils/load-datasets-sequentially.utils';
import { resolveMapDisplayDatasets } from '../utils/map-display-datasets.utils';
import { shouldUseMapLibreInterleaved } from '../utils/render-engine.utils';

export interface UseMapDisplayDataProps {
  getIsInitializing: () => boolean;
  onInitialized: () => void;
  clearError: () => void;
  setError: (message: string) => void;
}

export interface UseMapDisplayDataReturn {
  initialize: () => Promise<void>;
  readonly mapDisplayDatasets: DatasetResult[];
  readonly displayTables: SvelteMap<string, ArrowTable>;
  readonly displayDensityTables: SvelteMap<string, ArrowTable>;
  readonly displayGeoJSONs: SvelteMap<string, FeatureCollection>;
  readonly displaySplitData: SvelteMap<string, SplitRenderingTable>;
  readonly displayDataVersion: number;
}

export function useMapDisplayData(
  props: UseMapDisplayDataProps
): UseMapDisplayDataReturn {
  const { getIsInitializing, onInitialized, clearError, setError } = props;

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
  const joinedBasemapDisplayKeys = new SvelteMap<string, string>();
  const joinedBasemapDisplayLoads = new SvelteMap<string, Promise<void>>();

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
  const usesTiledBasemap = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: Boolean(activeOSMBasemap)
    })
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

  function collectPrimitiveNumericColumns(
    viz: VisualizationConfig,
    primitive: PrimitiveFilter | undefined
  ): string[] {
    const primitives = primitive ? [primitive] : ALL_PRIMITIVE_FILTERS;

    return primitives.flatMap((current) =>
      [
        getPrimitiveValueColumn(viz, current),
        getPrimitiveSizeColumn(viz, current)
      ].filter((column): column is string => Boolean(column))
    );
  }

  const rowScopeTargets = $derived.by(() =>
    visualizationStore.activeVisualizations.flatMap((viz) => {
      const sourceFileId = datasetsStore.datasets.find(
        (dataset) => dataset.id === viz.datasetId
      )?.sourceFileId;
      if (!sourceFileId) {
        return [];
      }

      // The undefined primitive is the scope a geometry with no resolved
      // primitive type renders under: every filter of the visualization.
      return [...ALL_PRIMITIVE_FILTERS, undefined].map(
        (primitive): RowScopeTarget => ({
          visualizationId: viz.id,
          datasetId: sourceFileId,
          vizFilters: viz.dataFilters,
          primitive,
          numericColumns: collectPrimitiveNumericColumns(viz, primitive)
        })
      );
    })
  );

  // Reload signature for the orthographic reproject opt-in: changes only when a
  // non-WGS84 dataset is displayed AND the user toggles a manual projection, so
  // the dataset's render table is re-fetched (reprojected to WGS84) or restored.
  const projectionReprojectSignature = $derived.by(() => {
    const hasNonWgs84Dataset = mapDisplayDatasets.some(
      (dataset) =>
        Boolean(dataset.geometry?.crs) && !isWgs84LikeCrs(dataset.geometry?.crs)
    );
    if (!hasNonWgs84Dataset) {
      return 'none';
    }
    const projState = getProjectionState();
    return projState.overrideActive === true &&
      projState.overrideSource === 'manual'
      ? 'projected'
      : 'native';
  });

  let loadGeneration = 0;
  let pendingReloadHandle: number | null = null;

  function isStaleLoad(generation: number): boolean {
    return loadGeneration !== generation;
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
  ): string | undefined {
    if (dataset) {
      return resolveBestSplitFeatureIdColumn(
        geometry,
        dataset,
        INTERNAL_COLUMN.FEATURE_ID
      );
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
    let tableName: string | undefined;
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
          const projState = getProjectionState();
          const hasManualProjectionOverride =
            projState.overrideActive === true &&
            projState.overrideSource === 'manual';
          const isNonWgs84 =
            Boolean(dataset.geometry?.crs) &&
            !isWgs84LikeCrs(dataset.geometry?.crs);
          // Reproject to WGS84 for the tiled (MapLibre) engine, or — in the
          // orthographic engine — when the user applies a d3 projection to a
          // non-WGS84 dataset (so it can be projected like a WGS84 one).
          const shouldReprojectToWgs84 =
            isNonWgs84 &&
            (usesTiledBasemap ||
              shouldReprojectDatasetForActiveProjection(
                dataset.geometry?.crs,
                hasManualProjectionOverride
              ));
          const arrowTable = shouldReprojectToWgs84
            ? await duckDBOrchestrator.getArrowTableReprojectedToWGS84(
                tableName
              )
            : duckDBDataset?.arrowTableWithMetadata
              ? duckDBDataset.arrowTableWithMetadata
              : await duckDBOrchestrator.getArrowTableDirect(tableName);

          if (arrowTable) {
            return arrowTable;
          }
        }
      }

      return null;
    } catch (error) {
      if (
        shouldIgnoreDatasetLoadError(dataset.id, generation, error, tableName)
      ) {
        return null;
      }

      logger.error(
        'Failed to load dataset Arrow table for map display',
        LogCategory.MAP,
        error
      );
      setError(
        error instanceof Error ? error.message : m.error_loading_subtitle()
      );
      return null;
    }
  }

  function removeDatasetFromDisplay(datasetId: string): void {
    const removedTable = displayTables.delete(datasetId);
    const removedDensityTable = displayDensityTables.delete(datasetId);
    const removedGeoJSON = displayGeoJSONs.delete(datasetId);
    const removedSplit = displaySplitData.delete(datasetId);
    joinedBasemapDisplayKeys.delete(datasetId);

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

  function getJoinedBasemapDisplayKey(
    datasetId: string,
    joinedBasemap: string,
    tableName: string
  ): string {
    return [
      datasetId,
      joinedBasemap,
      tableName,
      duckDBOrchestrator.datasetsVersion,
      basemapService.simplificationVersion
    ].join('::');
  }

  function findActiveDensityViz(datasetId: string): VisualizationConfig | null {
    const matches: VisualizationConfig[] = [];
    for (const viz of visualizationStore.activeVisualizations) {
      if (viz.datasetId !== datasetId) continue;
      if (getPolygonPrimitive(viz)?.fillMode !== FillMode.DENSITY) continue;
      if (!viz.density?.valueColumn || !viz.density?.ratio) continue;
      matches.push(viz);
    }
    return matches[0] ?? null;
  }

  async function loadJoinedBasemap(
    dataset: DatasetResult,
    joinedBasemap: string,
    tableName: string,
    generation: number
  ): Promise<void> {
    const datasetId = dataset.id;
    const displayKey = getJoinedBasemapDisplayKey(
      datasetId,
      joinedBasemap,
      tableName
    );

    const hasDisplayPayload =
      displayTables.has(datasetId) ||
      displayGeoJSONs.has(datasetId) ||
      displaySplitData.has(datasetId);
    if (
      joinedBasemapDisplayKeys.get(datasetId) === displayKey &&
      hasDisplayPayload
    ) {
      return;
    }
    if (!hasDisplayPayload) {
      joinedBasemapDisplayKeys.delete(datasetId);
    }

    const loadKey = `${displayKey}::${generation}`;
    const existingLoad = joinedBasemapDisplayLoads.get(loadKey);
    if (existingLoad) {
      await existingLoad;
      return;
    }

    const loadPromise = (async () => {
      await loadJoinedBasemapForDisplay(
        dataset,
        joinedBasemap,
        tableName,
        generation,
        displayKey
      );
    })();

    joinedBasemapDisplayLoads.set(loadKey, loadPromise);
    try {
      await loadPromise;
    } finally {
      if (joinedBasemapDisplayLoads.get(loadKey) === loadPromise) {
        joinedBasemapDisplayLoads.delete(loadKey);
      }
    }
  }

  async function loadJoinedBasemapForDisplay(
    dataset: DatasetResult,
    joinedBasemap: string,
    tableName: string,
    generation: number,
    displayKey: string
  ): Promise<void> {
    const datasetId = dataset.id;

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
        if (featureIdColumn) {
          setDisplaySplitTable(datasetId, {
            geometry: geometryArrow,
            dataset: datasetArrow,
            featureIdColumn
          });
          joinedBasemapDisplayKeys.set(datasetId, displayKey);
          return;
        }
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
        joinedBasemapDisplayKeys.set(datasetId, displayKey);
      } else {
        joinedBasemapDisplayKeys.delete(datasetId);
        removeDatasetFromDisplay(datasetId);
      }
    } catch (error) {
      if (isStaleLoad(generation) || !isDatasetExpectedForDisplay(datasetId)) {
        return;
      }

      logger.error('Failed to load joined basemap', LogCategory.MAP, error);
      joinedBasemapDisplayKeys.delete(datasetId);
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
    const datasetTableName =
      duckDBOrchestrator.getDatasetById(duckDBDatasetId)?.tableName;

    try {
      const { table } =
        await duckDBOrchestrator.getGPSArrowTable(duckDBDatasetId);

      if (generation !== undefined && isStaleLoad(generation)) return;

      if (!isDatasetExpectedForDisplay(datasetId)) {
        return;
      }

      if (table) {
        setDisplayArrowTable(datasetId, table);
      } else {
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
        } else if ('features' in result) {
          setDisplayGeoJSON(datasetId, result);
        }
      }

      await loadDensityTableForDisplay(dataset, generation);
    } else {
      const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
        dataset.sourceFileId
      );
      const joinedBasemap =
        duckDBDataset?.joinedBasemap ?? dataset.joinedBasemap;
      const tableName = duckDBDataset?.tableName ?? dataset.tableName;

      if (duckDBDataset?.gpsMode && duckDBDataset.gpsColumns) {
        await loadGPSData(datasetId, duckDBDataset.id, generation);
        await loadDensityTableForDisplay(dataset, generation);
      } else if (joinedBasemap && tableName) {
        await loadJoinedBasemap(dataset, joinedBasemap, tableName, generation);
        await loadDensityTableForDisplay(dataset, generation);
      } else {
        removeDensityTable(datasetId);
      }
    }
  }

  async function initialize(): Promise<void> {
    const initGeneration = ++loadGeneration;
    const [firstDataset, ...remainingDatasets] = mapDisplayDatasets;

    if (firstDataset) {
      await loadDatasetForDisplay(firstDataset, initGeneration);
    }

    onInitialized();

    bumpDisplayDataVersion();

    if (remainingDatasets.length > 0) {
      void loadDatasetsSequentially(remainingDatasets, (dataset) =>
        loadDatasetForDisplay(dataset, initGeneration)
      )
        .then(() => {})
        .catch((error) => {
          logger.error(
            'Failed to load remaining datasets',
            LogCategory.MAP,
            error
          );
        });
    }
  }

  $effect(() => {
    void duckDBDatasetsVersion;
    void densityReloadSignature;
    void basemapService.simplificationVersion;
    void projectionReprojectSignature;
    const currentMapDisplayDatasets = mapDisplayDatasets;

    if (getIsInitializing()) {
      return;
    }

    if (pendingReloadHandle !== null) {
      cancelAnimationFrame(pendingReloadHandle);
    }

    pendingReloadHandle = requestAnimationFrame(() => {
      pendingReloadHandle = null;
      untrack(() => {
        clearError();

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
    if (getIsInitializing() || !osmBasemap) {
      return;
    }

    const thisGeneration = ++loadGeneration;

    for (const dataset of mapDisplayDatasets) {
      const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
        dataset.sourceFileId
      );

      if (duckDBDataset?.gpsMode && duckDBDataset.gpsColumns) {
        loadGPSData(dataset.id, duckDBDataset.id, thisGeneration);
      }
    }
  });

  $effect(() => {
    void duckDBDatasetsVersion;
    const targets = rowScopeTargets;

    void rowScopeStore.sync(targets);
  });

  $effect(() => {
    void visualizationStore.version;
    void duckDBDatasetsVersion;
    void displayDataVersion;
    if (getIsInitializing()) return;

    const activeVizDatasetIds = new Set(
      visualizationStore.activeVisualizations.map((viz) => viz.datasetId)
    );
    const expectedDatasets = mapDisplayDatasets.filter((dataset) =>
      activeVizDatasetIds.has(dataset.id)
    );

    const missing = expectedDatasets.filter(
      (dataset) =>
        !displayTables.has(dataset.id) &&
        !displayGeoJSONs.has(dataset.id) &&
        !displaySplitData.has(dataset.id)
    );
    if (missing.length === 0) return;

    const reconcileGeneration = ++loadGeneration;
    untrack(() => {
      for (const dataset of missing) {
        joinedBasemapDisplayKeys.delete(dataset.id);
      }
      void loadDatasetsSequentially(missing, (dataset) =>
        loadDatasetForDisplay(dataset, reconcileGeneration)
      ).catch((error) => {
        logger.error(
          'Failed to reconcile missing visualization datasets',
          LogCategory.MAP,
          error
        );
      });
    });
  });

  return {
    initialize,
    get mapDisplayDatasets() {
      return mapDisplayDatasets;
    },
    get displayTables() {
      return displayTables;
    },
    get displayDensityTables() {
      return displayDensityTables;
    },
    get displayGeoJSONs() {
      return displayGeoJSONs;
    },
    get displaySplitData() {
      return displaySplitData;
    },
    get displayDataVersion() {
      return displayDataVersion;
    }
  };
}
