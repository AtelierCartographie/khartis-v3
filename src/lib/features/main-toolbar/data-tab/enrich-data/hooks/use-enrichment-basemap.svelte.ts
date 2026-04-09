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

export interface BasemapSuggestionItem {
  basemap: BasemapMetadata;
  score: number;
}

export interface UseEnrichmentBasemapReturn {
  readonly basemapTabIndex: number;
  readonly selectedBasemapId: string | undefined;
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
  clearBasemapImportError: () => void;
}

export function useEnrichmentBasemap(): UseEnrichmentBasemapReturn {
  let basemapTabIndex = $state(0);
  let selectedBasemapId = $state<string | undefined>(undefined);
  let basemapImportError = $state<string | null>(null);
  let basemapImportUploading = $state(false);
  let importedCustomBasemap = $state<BasemapMetadata | null>(null);
  let suggestedBasemaps = $state<BasemapSuggestionItem[]>([]);

  const basemaps = $derived(basemapCatalogService.catalogBasemaps);

  function setBasemapTabIndex(index: number): void {
    basemapTabIndex = index;
  }

  function handleSelectBasemap(basemapId: string): void {
    selectedBasemapId = basemapId;
    osmBasemapStore.clear();
    dataTabActions.setBasemapJoinState({
      selectedBasemap: basemapId,
      basemapSource: BasemapSource.CATALOG
    });

    basemapStyleStore.setReferenceBasemap(basemapId);

    projectStore.updateProjectData({
      basemap: {
        id: basemapId,
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
      dataTabActions.selectBasemap(customBasemap.file);
      await basemapService.registerCustomBasemap(customBasemap, geometryTable);
      basemapStyleStore.setReferenceBasemap(customBasemap.file);
      importedCustomBasemap = customBasemap;
      selectedBasemapId = customBasemap.file;

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

    osmBasemapStore.setOSMBasemap(osmBasemap);
    basemapStyleStore.setReferenceBasemap(null);
    dataTabActions.setBasemapJoinState({
      selectedBasemap: osmBasemap.file,
      basemapSource: BasemapSource.OSM
    });
    selectedBasemapId = osmBasemap.file;

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

      if (!selectedBasemapId && mappedSuggestions.length > 0) {
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
    clearBasemapImportError
  };
}
