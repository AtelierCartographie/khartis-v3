import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { normalizeToProcessedDataset } from '$lib/features/data-pipeline';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { isMissingDuckTableError } from '$lib/features/duckdb/utils/duckdb-error.utils';
import { BasemapStyle } from '$lib/features/map/constants';
import {
  basemapCatalogService,
  rankBasemapsByJoinSynthesis
} from '$lib/features/map/services/basemap-catalog.service.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import {
  activateDatasetGeometryBasemap,
  isDatasetGeometryBasemap
} from '$lib/features/map/services/dataset-geometry-basemap.service';
import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
import type {
  BasemapMetadata,
  BasemapSuggestion
} from '$lib/features/map/types/basemap.types';
import {
  createOSMBasemap,
  loadBasemapFromUrl,
  processBasemapImport
} from '$lib/features/map/services/basemap-import.service';
import { mapLoadingStore } from '$lib/features/map/stores/map-loading.store.svelte';
import * as m from '$lib/paraglide/messages';
import { shouldAutoSelectSuggestedBasemap } from '../utils/basemap-auto-selection.utils';
import {
  PERSISTED_BASEMAP_TYPE,
  resolveRelevantPersistedBasemap,
  restorePersistedBasemapSelection,
  resolveBasemapSource,
  type PersistedProjectBasemap
} from '../services/persisted-basemap.service';
import { resolveDatasetIdForOrchestrator } from '../utils/dataset-resolution.utils';
import { resolveNextBasemapSelectionId } from '../utils/basemap-selection.utils';
import { waitForDatasetAvailability } from '../utils/dataset-availability.utils';
import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';
import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
import { MAP_PROJECTION_TYPE } from '$lib/features/commons/constants';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import {
  dataTabActions,
  dataTabState
} from '$lib/features/commons/stores/data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { projectStore } from '$lib/features/commons/stores/project.store.svelte';

export interface BasemapSuggestionItem {
  basemap: BasemapMetadata;
  score: number;
}

const COORDINATE_GEO_TYPES = new Set<string>([
  GEO_COLUMN_TYPE.LATITUDE,
  GEO_COLUMN_TYPE.LONGITUDE,
  GEO_COLUMN_TYPE.COORDINATES
]);

export function pickAutoLinkedGeoColumn(
  dataset: DatasetResult
): { columnName: string; index: number } | null {
  const geoColumns = dataset.geoDetection?.geoColumns ?? [];
  const candidates = geoColumns.filter(
    (column) => !COORDINATE_GEO_TYPES.has(column.type as string)
  );
  if (candidates.length === 0) return null;

  const suggested = dataset.geoDetection?.suggestedPrimaryGeoColumn;
  const suggestedMatch =
    suggested && !COORDINATE_GEO_TYPES.has(suggested.type as string)
      ? candidates.find((column) => column.columnName === suggested.columnName)
      : undefined;

  const best =
    suggestedMatch ??
    candidates.reduce((winner, current) =>
      current.confidence > winner.confidence ? current : winner
    );

  const columnIndex = dataset.columns.findIndex(
    (column) => column.name === best.columnName
  );
  if (columnIndex === -1) return null;

  return { columnName: best.columnName, index: columnIndex };
}

export interface UseEnrichmentBasemapReturn {
  readonly basemapTabIndex: number;
  readonly selectedBasemapId: string | undefined;
  readonly hasActiveSelection: boolean;
  readonly basemapImportError: string | null;
  readonly basemapImportUploading: boolean;
  readonly importedCustomBasemap: BasemapMetadata | null;
  readonly basemaps: BasemapMetadata[];
  readonly suggestedBasemaps: BasemapSuggestionItem[];
  setBasemapTabIndex: (index: number) => void;
  handleSelectBasemap: (basemapId: string) => void;
  handleBasemapImportFile: (file: File) => Promise<void>;
  handleBasemapUrlLoad: (url: string) => Promise<void>;
  handleSelectOSM: () => void;
  activatePreferredBasemap: () => void;
  clearSelectedBasemap: () => void;
  clearBasemapImportError: () => void;
}

export function useEnrichmentBasemap(): UseEnrichmentBasemapReturn {
  let selectedBasemapId = $state<string | undefined>(undefined);
  let basemapImportError = $state<string | null>(null);
  let basemapImportUploading = $state(false);
  let importedCustomBasemap = $state<BasemapMetadata | null>(null);
  let suggestedBasemaps = $state<BasemapSuggestionItem[]>([]);
  let hasDismissedSuggestedBasemap = $state(false);
  let lastSelectedBasemapId = $state<string | undefined>(undefined);
  let lastSelectedBasemapSource = $state<BasemapSource | undefined>(undefined);
  let previousDatasetId = $state<string | undefined>(undefined);
  let suggestionResolutionRunId = 0;

  const basemapTabIndex = $derived(dataTabState.enrichData.basemapTabIndex);
  const runtimePersistedBasemap = $derived.by(() =>
    resolveRelevantPersistedBasemap({
      selectedDataset: datasetsStore.selectedDataset,
      sourceFiles: projectStore.currentProject?.data?.sourceFiles,
      projectBasemap:
        (projectStore.currentProject?.data?.basemap as
          PersistedProjectBasemap | undefined) ?? undefined,
      selectedBasemapId: selectedBasemapId,
      selectedBasemapSource: dataTabState.basemapJoin.basemapSource,
      hasMultipleDatasets: datasetsStore.datasets.length > 1
    })
  );

  const basemaps = $derived(basemapCatalogService.catalogBasemaps);
  // A dataset's own derived geometry occupies the reference slot by default; it
  // must not count as a user selection or the preferred basemap never returns.
  const hasActiveSelection = $derived(
    selectedBasemapId !== undefined ||
      osmBasemapStore.isActive ||
      (basemapStyleStore.referenceBasemapId !== null &&
        !isDatasetGeometryBasemap(basemapStyleStore.referenceBasemapId))
  );

  function setPreviewHold(
    value: boolean,
    runId: number | undefined = undefined
  ): void {
    if (runId !== undefined && runId !== suggestionResolutionRunId) {
      return;
    }

    if (mapLoadingStore.isHoldingPreviewForSuggestedBasemap === value) {
      return;
    }

    mapLoadingStore.setHoldingPreviewForSuggestedBasemap(value);
  }

  function clearSelectedBasemap(): void {
    selectedBasemapId = undefined;
    osmBasemapStore.clear();
    dataTabActions.setBasemapJoinState({
      selectedBasemap: '',
      basemapSource:
        dataTabState.enrichData.preferredOverlayBasemapSource ??
        lastSelectedBasemapSource ??
        BasemapSource.CATALOG
    });
    basemapStyleStore.setReferenceBasemap(null);
    projectStore.updateProjectData({ basemap: undefined });
    void activateDatasetGeometryBasemap();
  }

  function rememberPreferredBasemap(
    basemapId: string,
    source: BasemapSource
  ): void {
    lastSelectedBasemapId = basemapId;
    lastSelectedBasemapSource = source;
    dataTabActions.setEnrichDataState({
      preferredOverlayBasemapId: basemapId,
      preferredOverlayBasemapSource: source
    });
  }

  function applyReferenceBasemap(
    basemap: BasemapMetadata,
    source: BasemapSource
  ): void {
    hasDismissedSuggestedBasemap = false;
    selectedBasemapId = basemap.file;
    rememberPreferredBasemap(basemap.file, source);
    osmBasemapStore.clear();
    dataTabActions.setBasemapJoinState({
      selectedBasemap: basemap.file,
      basemapSource: source
    });

    basemapStyleStore.setReferenceBasemap(basemap.file);

    projectStore.updateProjectData({
      basemap:
        source === BasemapSource.IMPORT
          ? {
              id: basemap.file,
              type: PERSISTED_BASEMAP_TYPE.CUSTOM,
              data: { ...basemap }
            }
          : {
              id: basemap.file,
              type: PERSISTED_BASEMAP_TYPE.CATALOG
            }
    });
  }

  function activatePreferredBasemap(): void {
    if (hasActiveSelection) {
      return;
    }

    const preferredBasemapId =
      dataTabState.enrichData.preferredOverlayBasemapId ??
      lastSelectedBasemapId;
    const preferredBasemapSource =
      dataTabState.enrichData.preferredOverlayBasemapSource ??
      lastSelectedBasemapSource;

    if (preferredBasemapSource === BasemapSource.OSM && preferredBasemapId) {
      handleSelectOSM();
      return;
    }

    if (preferredBasemapId) {
      const preferredBasemap =
        basemapCatalogService.getBasemapById(preferredBasemapId);

      if (preferredBasemap) {
        applyReferenceBasemap(
          preferredBasemap,
          preferredBasemapSource ?? BasemapSource.CATALOG
        );
        return;
      }
    }

    if (suggestedBasemaps.length > 0) {
      handleSelectBasemap(suggestedBasemaps[0].basemap.file);
    }
  }

  function setBasemapTabIndex(index: number): void {
    dataTabActions.setEnrichDataState({ basemapTabIndex: index });
  }

  function handleSelectBasemap(basemapId: string): void {
    const nextBasemapId = resolveNextBasemapSelectionId(
      selectedBasemapId,
      basemapId
    );

    if (!nextBasemapId) {
      hasDismissedSuggestedBasemap = true;
      clearSelectedBasemap();
      return;
    }

    hasDismissedSuggestedBasemap = false;
    const basemap = basemapCatalogService.getBasemapById(nextBasemapId);
    applyReferenceBasemap(
      basemap ?? ({ file: nextBasemapId } as BasemapMetadata),
      BasemapSource.CATALOG
    );
  }

  async function handleBasemapImportFile(file: File): Promise<void> {
    basemapImportUploading = true;
    basemapImportError = null;

    try {
      const { basemap: customBasemap, geometryTable } =
        await processBasemapImport(file);

      basemapCatalogService.addCustomBasemap(customBasemap);
      osmBasemapStore.clear();
      dataTabActions.setBasemapJoinState({
        selectedBasemap: customBasemap.file,
        basemapSource: BasemapSource.IMPORT
      });
      await basemapService.registerCustomBasemap(customBasemap, geometryTable);
      basemapStyleStore.setReferenceBasemap(customBasemap.file);
      importedCustomBasemap = customBasemap;
      selectedBasemapId = customBasemap.file;
      rememberPreferredBasemap(customBasemap.file, BasemapSource.IMPORT);

      projectStore.updateProjectData({
        basemap: {
          id: customBasemap.file,
          type: PERSISTED_BASEMAP_TYPE.CUSTOM,
          data: { ...customBasemap }
        }
      });
    } catch (error) {
      logger.error('Failed to import custom basemap', LogCategory.MAP, error);
      basemapImportError =
        error instanceof Error ? error.message : m.error_import_default();
    } finally {
      basemapImportUploading = false;
    }
  }

  async function handleBasemapUrlLoad(url: string): Promise<void> {
    basemapImportUploading = true;
    basemapImportError = null;

    try {
      const file = await loadBasemapFromUrl(url);
      await handleBasemapImportFile(file);
    } catch (err) {
      logger.error('Error loading basemap URL', LogCategory.MAP, err);
      basemapImportError =
        err instanceof Error ? err.message : m.error_loading_default();
    } finally {
      basemapImportUploading = false;
    }
  }

  function handleSelectOSM(): void {
    const referenceStyle =
      basemapStyleStore.lastSelectedTiledStyle ?? BasemapStyle.MONDE_COULEURS;
    const osmBasemap = createOSMBasemap(referenceStyle);

    hasDismissedSuggestedBasemap = false;
    basemapCatalogService.addCustomBasemap(osmBasemap);
    osmBasemapStore.setOSMBasemap(osmBasemap);
    if (mapProjectionStore.isGlobe) {
      mapProjectionStore.setProjection(MAP_PROJECTION_TYPE.MERCATOR);
    }
    basemapStyleStore.setReferenceBasemap(null);
    basemapStyleStore.setStyle(referenceStyle);
    basemapStyleStore.requestViewportReset(referenceStyle);
    dataTabActions.setBasemapJoinState({
      selectedBasemap: osmBasemap.file,
      basemapSource: BasemapSource.OSM
    });
    selectedBasemapId = osmBasemap.file;
    rememberPreferredBasemap(osmBasemap.file, BasemapSource.OSM);

    projectStore.updateProjectData({
      basemap: {
        id: osmBasemap.file,
        type: PERSISTED_BASEMAP_TYPE.OSM,
        data: { ...osmBasemap }
      }
    });
  }

  function clearBasemapImportError(): void {
    basemapImportError = null;
  }

  function isCurrentSuggestionInput(
    selectedDataset: DatasetResult,
    datasetId: string,
    geoColumnName: string
  ): boolean {
    const currentDataset = datasetsStore.selectedDataset;
    return (
      currentDataset?.id === selectedDataset.id &&
      currentDataset?.sourceFileId === selectedDataset.sourceFileId &&
      currentDataset?.tableName === selectedDataset.tableName &&
      resolveDatasetIdForOrchestrator(currentDataset) === datasetId &&
      dataTabState.geolocation.linkedVariableName === geoColumnName
    );
  }

  $effect(() => {
    const selectedDataset = datasetsStore.selectedDataset;
    const datasetId = selectedDataset?.id;
    if (datasetId !== previousDatasetId) {
      previousDatasetId = datasetId;
      hasDismissedSuggestedBasemap = false;
      setPreviewHold(false);
    }
  });

  let lastRestoredBasemapKey: string | undefined = undefined;

  $effect(() => {
    const projectBasemap = runtimePersistedBasemap;
    const basemapCount = basemapCatalogService.basemaps.length;

    if (projectBasemap?.id) {
      const restoreKey = `${projectBasemap.id}::${projectBasemap.type}::${basemapCount}`;
      if (restoreKey !== lastRestoredBasemapKey) {
        lastRestoredBasemapKey = restoreKey;
        void restorePersistedBasemapSelection(projectBasemap).then(() => {
          selectedBasemapId = projectBasemap.id;
          rememberPreferredBasemap(
            projectBasemap.id,
            resolveBasemapSource(projectBasemap.type)
          );
        });
      }
      return;
    }

    lastRestoredBasemapKey = undefined;
    selectedBasemapId = basemapStyleStore.referenceBasemapId ?? undefined;
    if (selectedBasemapId) {
      rememberPreferredBasemap(selectedBasemapId, BasemapSource.CATALOG);
      return;
    }

    if (osmBasemapStore.activeOSMBasemap) {
      selectedBasemapId = osmBasemapStore.activeOSMBasemap.file;
      rememberPreferredBasemap(selectedBasemapId, BasemapSource.OSM);
      return;
    }

    selectedBasemapId = undefined;
  });

  $effect(() => {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset) return;

    const currentLinked = dataTabState.geolocation.linkedVariableName;
    if (currentLinked) return;

    const suggested = pickAutoLinkedGeoColumn(dataset);
    if (!suggested) return;

    dataTabActions.setGeolocationState({
      linkedVariable: suggested.index,
      linkedVariableName: suggested.columnName
    });
  });

  $effect(() => {
    const datasetId = datasetsStore.selectedDataset?.id;
    const linkedVariableName = dataTabState.geolocation.linkedVariableName;
    const basemapCount = basemapCatalogService.basemaps.length;

    void datasetId;
    void linkedVariableName;
    void basemapCount;

    const resolutionRunId = ++suggestionResolutionRunId;
    let cancelled = false;

    async function refreshSuggestions() {
      const selectedDataset = datasetsStore.selectedDataset;
      setPreviewHold(false, resolutionRunId);

      if (!selectedDataset) {
        if (!cancelled) {
          suggestedBasemaps = [];
        }
        return;
      }

      if (!basemapCatalogService.isLoaded) {
        await basemapCatalogService.loadCatalog();
      }

      const processedDataset = normalizeToProcessedDataset(selectedDataset);
      const geoColumnName = dataTabState.geolocation.linkedVariableName;
      const datasetId =
        resolveDatasetIdForOrchestrator(selectedDataset) ?? null;
      let suggestions: BasemapSuggestion[] = [];

      if (datasetId && geoColumnName) {
        const datasetReady = await waitForDatasetAvailability(datasetId, {
          isCancelled: () => cancelled
        });

        if (
          datasetReady &&
          !cancelled &&
          isCurrentSuggestionInput(selectedDataset, datasetId, geoColumnName) &&
          duckDBOrchestrator.findDatasetByIdOrSourceFile(datasetId)
        ) {
          try {
            const synthesis = await duckDBOrchestrator.computeJoinSynthesis(
              datasetId,
              geoColumnName
            );
            suggestions = rankBasemapsByJoinSynthesis(
              basemapCatalogService.basemaps,
              synthesis,
              3
            );
          } catch (error) {
            if (!cancelled && !isMissingDuckTableError(error)) {
              logger.error(
                'Failed to compute basemap join suggestions',
                LogCategory.DATA,
                error
              );
            }
          }
        }
      }

      if (suggestions.length === 0) {
        suggestions = basemapCatalogService.getSuggestions(
          processedDataset,
          3,
          geoColumnName
        );
      }

      if (suggestions.length === 0 && selectedDataset.bounds) {
        suggestions = basemapCatalogService.getSuggestionsByGPSBbox(
          selectedDataset.bounds,
          3
        );
      }

      if (cancelled) return;

      const mappedSuggestions = suggestions.map((suggestion) => ({
        basemap:
          basemapCatalogService.getBasemapById(suggestion.file) ?? suggestion,
        score: suggestion.matchScore
      }));

      suggestedBasemaps = mappedSuggestions;

      if (cancelled || resolutionRunId !== suggestionResolutionRunId) {
        return;
      }

      if (
        dataTabState.enrichData.overlayBasemapEnabled &&
        shouldAutoSelectSuggestedBasemap({
          hasDismissedSuggestedBasemap,
          suggestionCount: mappedSuggestions.length,
          isOSMActive: osmBasemapStore.isActive,
          hasDatasetGeometry: Boolean(selectedDataset.geometry),
          persistedBasemapId: runtimePersistedBasemap?.id,
          selectedBasemapId,
          hasSelectedAvailableBasemap: Boolean(
            selectedBasemapId &&
            basemapCatalogService.getBasemapById(selectedBasemapId)
          )
        })
      ) {
        handleSelectBasemap(mappedSuggestions[0].basemap.file);
      }
    }

    void refreshSuggestions()
      .catch(() => {
        if (cancelled) return;
        suggestedBasemaps = [];
      })
      .finally(() => {
        if (cancelled) return;
        setPreviewHold(false, resolutionRunId);
      });

    return () => {
      cancelled = true;
      setPreviewHold(false, resolutionRunId);
    };
  });

  return {
    get basemapTabIndex() {
      return basemapTabIndex;
    },
    get selectedBasemapId() {
      return selectedBasemapId;
    },
    get hasActiveSelection() {
      return hasActiveSelection;
    },
    get basemapImportError() {
      return basemapImportError;
    },
    get basemapImportUploading() {
      return basemapImportUploading;
    },
    get importedCustomBasemap() {
      return importedCustomBasemap;
    },
    get basemaps() {
      return basemaps;
    },
    get suggestedBasemaps() {
      return suggestedBasemaps;
    },
    setBasemapTabIndex,
    handleSelectBasemap,
    handleBasemapImportFile,
    handleBasemapUrlLoad,
    handleSelectOSM,
    activatePreferredBasemap,
    clearSelectedBasemap,
    clearBasemapImportError
  };
}
