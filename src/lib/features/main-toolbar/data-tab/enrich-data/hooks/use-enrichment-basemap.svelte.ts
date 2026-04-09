import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
import {
  dataTabActions,
  dataTabState
} from '$lib/features/commons/store/data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { DEFAULT_OSM_STYLE } from '$lib/features/map/constants';
import {
  basemapCatalogService,
  rankBasemapsByJoinSynthesis
} from '$lib/features/map/services/basemap-catalog.service.svelte';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
import type {
  BasemapMetadata,
  BasemapSuggestion
} from '$lib/features/map/types/basemap.types';
import {
  createOSMBasemap,
  loadBasemapFromUrl,
  processBasemapImport
} from '$lib/features/map/utils/basemap-import.utils';
import * as m from '$lib/paraglide/messages';
import { resolveNextBasemapSelectionId } from '../../services/basemap-selection';

export interface BasemapSuggestionItem {
  basemap: BasemapMetadata;
  score: number;
}

function isProjectBasemapData(value: unknown): value is BasemapMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.file === 'string' &&
    typeof candidate.title_fr === 'string' &&
    typeof candidate.title_en === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.proj_source === 'string' &&
    Array.isArray(candidate.bbox) &&
    candidate.bbox.length === 4 &&
    Array.isArray(candidate.layers)
  );
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

  const basemapTabIndex = $derived(dataTabState.enrichData.basemapTabIndex);

  const basemaps = $derived(basemapCatalogService.catalogBasemaps);
  const hasActiveSelection = $derived(
    selectedBasemapId !== undefined ||
      osmBasemapStore.isActive ||
      basemapStyleStore.referenceBasemapId !== null
  );

  function clearSelectedBasemap(): void {
    selectedBasemapId = undefined;
    osmBasemapStore.clear();
    dataTabActions.selectBasemap('');
    basemapStyleStore.setReferenceBasemap(null);
    projectStore.updateProjectData({ basemap: undefined });
  }

  function activatePreferredBasemap(): void {
    if (hasActiveSelection) {
      return;
    }

    if (
      lastSelectedBasemapSource === BasemapSource.OSM &&
      lastSelectedBasemapId
    ) {
      handleSelectOSM();
      return;
    }

    if (lastSelectedBasemapId) {
      const preferredBasemap = basemapCatalogService.getBasemapById(
        lastSelectedBasemapId
      );

      if (preferredBasemap) {
        handleSelectBasemap(preferredBasemap.file);
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
    selectedBasemapId = nextBasemapId;
    lastSelectedBasemapId = nextBasemapId;
    lastSelectedBasemapSource = BasemapSource.CATALOG;
    osmBasemapStore.clear();
    dataTabActions.setBasemapJoinState({
      selectedBasemap: nextBasemapId,
      basemapSource: BasemapSource.CATALOG
    });

    basemapStyleStore.setReferenceBasemap(nextBasemapId);

    projectStore.updateProjectData({
      basemap: {
        id: nextBasemapId,
        type: 'catalog'
      }
    });
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
      lastSelectedBasemapId = customBasemap.file;
      lastSelectedBasemapSource = BasemapSource.IMPORT;

      projectStore.updateProjectData({
        basemap: {
          id: customBasemap.file,
          type: 'custom',
          data: { ...customBasemap }
        }
      });

      logger.debug('Custom basemap imported', LogCategory.MAP, {
        title: customBasemap.title_fr
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
    const osmBasemap = createOSMBasemap(DEFAULT_OSM_STYLE);

    hasDismissedSuggestedBasemap = false;
    osmBasemapStore.setOSMBasemap(osmBasemap);
    basemapStyleStore.setReferenceBasemap(null);
    dataTabActions.setBasemapJoinState({
      selectedBasemap: osmBasemap.file,
      basemapSource: BasemapSource.OSM
    });
    selectedBasemapId = osmBasemap.file;
    lastSelectedBasemapId = osmBasemap.file;
    lastSelectedBasemapSource = BasemapSource.OSM;

    projectStore.updateProjectData({
      basemap: {
        id: osmBasemap.file,
        type: 'osm',
        data: { ...osmBasemap }
      }
    });

    logger.debug('OSM basemap selected', LogCategory.MAP);
  }

  function clearBasemapImportError(): void {
    basemapImportError = null;
  }

  $effect(() => {
    const datasetId = datasetsStore.selectedDataset?.id;
    if (datasetId !== previousDatasetId) {
      previousDatasetId = datasetId;
      hasDismissedSuggestedBasemap = false;
    }
  });

  $effect(() => {
    const projectBasemap = projectStore.currentProject?.data?.basemap;
    const basemapCount = basemapCatalogService.basemaps.length;
    const referenceBasemapId = basemapStyleStore.referenceBasemapId;
    const activeOSMBasemap = osmBasemapStore.activeOSMBasemap;

    void basemapCount;

    if (
      (projectBasemap?.type === 'custom' || projectBasemap?.type === 'osm') &&
      isProjectBasemapData(projectBasemap.data)
    ) {
      const customBasemapData = projectBasemap.data;

      if (!basemapCatalogService.getBasemapById(projectBasemap.id)) {
        basemapCatalogService.addCustomBasemap(customBasemapData);
      }

      if (
        projectBasemap.type === 'osm' &&
        activeOSMBasemap?.file !== customBasemapData.file
      ) {
        osmBasemapStore.setOSMBasemap(customBasemapData);
      }
    }

    if (activeOSMBasemap) {
      selectedBasemapId = activeOSMBasemap.file;
      lastSelectedBasemapId = activeOSMBasemap.file;
      lastSelectedBasemapSource = BasemapSource.OSM;
      return;
    }

    if (referenceBasemapId) {
      selectedBasemapId = referenceBasemapId;
      lastSelectedBasemapId = referenceBasemapId;
      lastSelectedBasemapSource =
        projectBasemap?.type === 'custom'
          ? BasemapSource.IMPORT
          : BasemapSource.CATALOG;
      return;
    }

    selectedBasemapId = undefined;
  });

  $effect(() => {
    const datasetId = datasetsStore.selectedDataset?.id;
    const linkedVariableName = dataTabState.geolocation.linkedVariableName;
    const basemapCount = basemapCatalogService.basemaps.length;

    void datasetId;
    void linkedVariableName;
    void basemapCount;

    let cancelled = false;

    async function refreshSuggestions() {
      const selectedDataset = datasetsStore.selectedDataset;
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
        selectedDataset.id ?? selectedDataset.sourceFileId ?? null;
      let suggestions: BasemapSuggestion[] = [];

      if (datasetId && geoColumnName) {
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
          logger.warn(
            'Enrichment basemap suggestions fell back to heuristics',
            LogCategory.MAP,
            error
          );
        }
      }

      if (suggestions.length === 0) {
        suggestions = basemapCatalogService.getSuggestions(
          processedDataset,
          3,
          geoColumnName
        );
      }

      if (cancelled) return;

      const mappedSuggestions = suggestions.map((suggestion) => ({
        basemap:
          basemapCatalogService.getBasemapById(suggestion.file) ?? suggestion,
        score: suggestion.matchScore
      }));

      suggestedBasemaps = mappedSuggestions;

      if (
        !hasDismissedSuggestedBasemap &&
        !selectedBasemapId &&
        mappedSuggestions.length > 0
      ) {
        handleSelectBasemap(mappedSuggestions[0].basemap.file);
      }
    }

    void refreshSuggestions().catch((error) => {
      if (cancelled) return;
      logger.debug(
        'Failed to refresh enrichment basemap suggestions',
        LogCategory.MAP,
        error
      );
      suggestedBasemaps = [];
    });

    return () => {
      cancelled = true;
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
