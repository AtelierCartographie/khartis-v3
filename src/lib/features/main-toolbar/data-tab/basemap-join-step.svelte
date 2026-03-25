<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { globalActions } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { hasGPSCoordinateColumns } from '$lib/features/commons/utils/geo-detector.utils';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';

  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { DEFAULT_OSM_STYLE } from '$lib/features/map/constants';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
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
  import { Earth, List, Upload } from 'carbon-icons-svelte';
  import BasemapCatalogTab from './basemap-join-components/basemap-catalog-tab.svelte';
  import BasemapImportTab from './basemap-join-components/basemap-import-tab.svelte';
  import BasemapOsmTab from './basemap-join-components/basemap-osm-tab.svelte';
  import JoinAssistedSection from './basemap-join-components/join-assisted-section.svelte';
  import BasemapSuggestionModal from './components/basemap-suggestion-modal.svelte';
  import { InfoPopover } from '../visualization-tab/components/shared';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import { dataTabStore } from './data-tab.store.svelte';
  import {
    getDatasetIdentity,
    shouldResetJoinState
  } from './services/dataset-identity';
  import { resolveDatasetIdForOrchestrator } from './services/dataset-resolution';
  import { hasBlockingJoinIssues } from './services/join-validation';

  const OSM_TAB_INDEX = 2;

  let activeTabIndex = $state(0);

  const tabItems = [
    { icon: List, label: m.basemap_catalog(), iconSize: 20 },
    { icon: Upload, label: m.basemap_import(), iconSize: 20 },
    { icon: Earth, label: m.basemap_osm(), iconSize: 20 }
  ];

  const basemapStepIndex = $derived(dataTabStore.basemapStepIndex);
  const basemapSelected = $derived(dataTabState.basemapJoin.selectedBasemap);
  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const datasetIdForOrchestrator = $derived.by(() =>
    resolveDatasetIdForOrchestrator(selectedDataset)
  );
  let basemapSuggestions = $state<BasemapSuggestion[]>([]);

  const joinRows = $derived(dataTabState.basemapJoin.joinMappings);
  const duplicates = $derived(dataTabState.basemapJoin.duplicateEntities);
  const unknowns = $derived(dataTabState.basemapJoin.unrecognizedEntities);
  const joinedCount = $derived(dataTabState.basemapJoin.joinedEntities);
  const toVerifyCount = $derived(dataTabState.basemapJoin.entitiesToVerify);

  const allBasemaps = $derived(basemapCatalogService.basemaps);

  let importFiles = $state<File[]>([]);
  let importUploading = $state(false);
  let importError = $state<string | null>(null);
  let importedBasemap = $state<BasemapMetadata | null>(null);
  let showSuggestionModal = $state(false);
  let joinLoading = $state(false);
  let suggestionsDatasetIdentity = $state<string | null>(null);
  let basemapAttributeValues = $state<string[]>([]);

  let currentJoinAbortController: AbortController | null = null;
  let previousJoinContext: string | null = null;
  let previousLinkedVariableName: string | null = null;
  const DATASET_READY_RETRY_DELAY_MS = 120;
  const DATASET_READY_MAX_RETRIES = 8;

  const hasGPSCoordinates = $derived(() => {
    if (!selectedDataset) return false;
    const columns = selectedDataset.columns || [];
    return hasGPSCoordinateColumns(columns);
  });

  const isGPSModeActive = $derived(hasGPSCoordinates());

  const suggestedBasemaps = $derived(() => {
    return basemapSuggestions
      .map((s: BasemapSuggestion) => ({
        basemap: allBasemaps.find((b: BasemapMetadata) => b.file === s.file),
        score: s.matchScore
      }))
      .filter((item) => item.basemap !== undefined) as {
      basemap: BasemapMetadata;
      score: number;
    }[];
  });

  function hasAvailableBasemap(basemapId: string): boolean {
    if (!basemapId) return false;
    return allBasemaps.some((basemap) => basemap.file === basemapId);
  }

  async function autoSelectFirstSuggestedBasemap(): Promise<void> {
    if (basemapSuggestions.length === 0) return;

    const firstSuggestion = allBasemaps.find(
      (basemap) => basemap.file === basemapSuggestions[0]?.file
    );

    if (!firstSuggestion) return;

    await handleSelectBasemap(firstSuggestion);
  }

  function isDatasetNotFoundError(error: unknown): boolean {
    return error instanceof Error && error.message === 'Dataset not found';
  }

  function isOSMBasemapId(basemapId: string): boolean {
    return basemapId.startsWith('osm_');
  }

  async function waitForDatasetAvailability(
    datasetId: string,
    abortSignal: AbortSignal
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= DATASET_READY_MAX_RETRIES; attempt++) {
      if (abortSignal.aborted) return false;

      const dataset =
        duckDBOrchestrator.getDataset(datasetId) ||
        duckDBOrchestrator.getDatasetBySourceFile(datasetId);
      if (dataset) {
        return true;
      }

      if (attempt === DATASET_READY_MAX_RETRIES) {
        return false;
      }

      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
          abortSignal.removeEventListener('abort', onAbort);
          resolve();
        }, DATASET_READY_RETRY_DELAY_MS);

        const onAbort = () => {
          clearTimeout(timeoutId);
          resolve();
        };

        abortSignal.addEventListener('abort', onAbort, { once: true });
      });
    }

    return false;
  }

  function fetchBasemapAttributeValues(basemap: BasemapMetadata): void {
    duckDBOrchestrator
      .getBasemapAttributeValues(basemap)
      .then((values) => {
        basemapAttributeValues = values;
      })
      .catch((error) => {
        logger.error(
          'Failed to fetch basemap attribute values',
          LogCategory.MAP,
          error
        );
        basemapAttributeValues = [];
      });
  }

  async function computeAndAutoFinalizeJoin(
    basemap: BasemapMetadata,
    abortSignal: AbortSignal,
    linkedVariableName = dataTabState.geolocation.linkedVariableName
  ): Promise<void> {
    const resolvedDatasetId = datasetIdForOrchestrator;
    if (!selectedDataset || !resolvedDatasetId || !linkedVariableName) return;
    if (isOSMBasemapId(basemap.file) || hasGPSCoordinates()) return;

    joinLoading = true;
    try {
      const datasetReady = await waitForDatasetAvailability(
        resolvedDatasetId,
        abortSignal
      );

      if (abortSignal.aborted) return;

      if (!datasetReady) {
        return;
      }

      const stats = await duckDBOrchestrator.computeJoinStats(
        resolvedDatasetId,
        basemap,
        linkedVariableName
      );

      if (abortSignal.aborted) {
        return;
      }

      dataTabActions.setJoinStats(stats);

      if (stats.unrecognizedCount > 0) {
        fetchBasemapAttributeValues(basemap);
      } else {
        basemapAttributeValues = [];
      }

      const hasBlocking = hasBlockingJoinIssues(stats);

      if (!hasBlocking && stats.joinedCount > 0) {
        try {
          await duckDBOrchestrator.finalizeJoin(
            resolvedDatasetId,
            basemap,
            linkedVariableName
          );
          dataTabStore.markStepComplete(basemapStepIndex);
        } catch (finalizeError) {
          if (isDatasetNotFoundError(finalizeError)) {
            return;
          }

          logger.error(
            'Failed to auto-finalize join',
            LogCategory.MAP,
            finalizeError
          );
          showError(m.join_error_title(), m.join_error_message());
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      if (isDatasetNotFoundError(error)) {
        return;
      }

      logger.error('Failed to compute join stats', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      joinLoading = false;
    }
  }

  async function handleSelectBasemap(basemap: BasemapMetadata) {
    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    osmBasemapStore.clear();
    dataTabActions.clearJoinStats();
    basemapAttributeValues = [];
    dataTabStore.resetStepCompletion(basemapStepIndex);
    dataTabActions.selectBasemap(basemap.file);
    basemapStyleStore.setReferenceBasemap(basemap.file);

    projectStore.updateProjectData({
      basemap: {
        id: basemap.file,
        type: basemap.isCustom ? 'custom' : 'catalog',
        data: basemap.isCustom ? { ...basemap } : undefined
      }
    });

    if (hasGPSCoordinates() && datasetIdForOrchestrator) {
      try {
        await duckDBOrchestrator.finalizeJoin(
          datasetIdForOrchestrator,
          basemap,
          ''
        );
        dataTabStore.markStepComplete(basemapStepIndex);
        logger.debug(
          'Basemap selected with GPS mode — join skipped',
          LogCategory.MAP
        );
      } catch (error) {
        logger.error(
          'Failed to finalize GPS mode for catalog basemap',
          LogCategory.MAP,
          error
        );
        showError(m.join_error_title(), m.join_error_message());
      }
    } else {
      await computeAndAutoFinalizeJoin(basemap, abortSignal);
    }
  }

  function handleFileDrop(event: DragEvent) {
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      importFiles = [files[0]];
      handleImportFile();
    }
  }

  function handleFileInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      importFiles = [target.files[0]];
      handleImportFile();
    }
  }

  async function handleImportFile() {
    if (importFiles.length === 0) {
      importError = m.basemap_import_modal_error_select_file();
      return;
    }

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    importUploading = true;
    importError = null;
    dataTabActions.clearJoinStats();
    dataTabStore.resetStepCompletion(basemapStepIndex);

    try {
      const file = importFiles[0];
      const { basemap: customBasemap, geometryTable } =
        await processBasemapImport(file);

      if (abortSignal.aborted) return;

      basemapCatalogService.addCustomBasemap(customBasemap);
      osmBasemapStore.clear();
      dataTabActions.selectBasemap(customBasemap.file);
      await basemapService.registerCustomBasemap(customBasemap, geometryTable);
      basemapStyleStore.setReferenceBasemap(customBasemap.file);
      importedBasemap = customBasemap;

      projectStore.updateProjectData({
        basemap: {
          id: customBasemap.file,
          type: 'custom',
          data: { ...customBasemap }
        }
      });

      if (hasGPSCoordinates() && datasetIdForOrchestrator) {
        await duckDBOrchestrator.finalizeJoin(
          datasetIdForOrchestrator,
          customBasemap,
          ''
        );
        dataTabStore.markStepComplete(basemapStepIndex);
        logger.success(
          'Custom basemap imported with GPS mode — join skipped',
          LogCategory.MAP
        );
      } else {
        await computeAndAutoFinalizeJoin(customBasemap, abortSignal);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      logger.error('Error importing custom basemap', LogCategory.MAP, err);
      importError =
        err instanceof Error ? err.message : m.basemap_custom_error();
    } finally {
      importUploading = false;
    }
  }

  async function handleLoadUrl(url: string) {
    if (!url) return;

    importUploading = true;
    importError = null;

    try {
      const file = await loadBasemapFromUrl(url);
      importFiles = [file];
      await handleImportFile();
    } catch (err) {
      logger.error('Error loading URL', LogCategory.MAP, err);
      importError =
        err instanceof Error ? err.message : m.basemap_url_error_generic();
    } finally {
      importUploading = false;
    }
  }

  async function handleSelectOSM() {
    if (!hasGPSCoordinates()) {
      return;
    }

    if (!selectedDataset) {
      logger.warn('No dataset selected for OSM basemap', LogCategory.MAP);
      return;
    }

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
      currentJoinAbortController = null;
    }

    dataTabActions.clearJoinStats();
    dataTabStore.resetStepCompletion(basemapStepIndex);

    const osmBasemap = createOSMBasemap(DEFAULT_OSM_STYLE);

    basemapCatalogService.addCustomBasemap(osmBasemap);
    osmBasemapStore.setOSMBasemap(osmBasemap);
    dataTabActions.selectBasemap(osmBasemap.file);
    basemapStyleStore.setReferenceBasemap(null);

    projectStore.updateProjectData({
      basemap: {
        id: osmBasemap.file,
        type: 'osm',
        data: { ...osmBasemap }
      }
    });

    if (!datasetIdForOrchestrator) {
      logger.warn('No dataset ID for orchestrator', LogCategory.MAP);
      return;
    }

    try {
      await duckDBOrchestrator.finalizeJoin(
        datasetIdForOrchestrator,
        osmBasemap,
        ''
      );
      dataTabStore.markStepComplete(basemapStepIndex);
      logger.success('OSM basemap activated with GPS mode', LogCategory.MAP);
    } catch (error) {
      logger.error('Failed to activate OSM GPS mode', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    }
  }

  function handleGoToVisualize() {
    globalActions.setNavigationState(ToolbarStep.Visualizations);
  }

  async function handleApplyCorrections() {
    if (
      !selectedDataset ||
      !datasetIdForOrchestrator ||
      !dataTabState.geolocation.linkedVariableName
    )
      return;

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    const corrections: Record<string, string> = {};
    dataTabState.basemapJoin.joinMappings.forEach((mapping) => {
      if (
        mapping.selectedMapping &&
        mapping.selectedMapping !== mapping.dataValue
      ) {
        corrections[mapping.dataValue] = mapping.selectedMapping;
      }
    });

    try {
      joinLoading = true;
      await duckDBOrchestrator.applyJoinCorrections(
        datasetIdForOrchestrator,
        dataTabState.geolocation.linkedVariableName,
        corrections
      );

      if (abortSignal.aborted) return;

      dataTabActions.applyCorrections();

      const basemap = allBasemaps.find((b) => b.file === basemapSelected);
      if (basemap) {
        const stats = await duckDBOrchestrator.computeJoinStats(
          datasetIdForOrchestrator,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );

        if (abortSignal.aborted) {
          logger.debug(
            'Corrections cancelled (basemap changed)',
            LogCategory.MAP
          );
          return;
        }

        dataTabActions.setJoinStats(stats);

        if (stats.unrecognizedCount > 0) {
          fetchBasemapAttributeValues(basemap);
        } else {
          basemapAttributeValues = [];
        }

        const hasBlocking = hasBlockingJoinIssues(stats);

        if (hasBlocking || stats.joinedCount === 0) {
          logger.info(
            'Corrections applied but join still requires manual validation',
            LogCategory.MAP,
            {
              toVerify: stats.toVerifyCount,
              duplicates: stats.duplicateCount,
              joinedCount: stats.joinedCount
            }
          );
          return;
        }

        await duckDBOrchestrator.finalizeJoin(
          datasetIdForOrchestrator,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );
        dataTabStore.markStepComplete(basemapStepIndex);
        logger.success(
          'Corrections applied and join finalized',
          LogCategory.MAP
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      logger.error('Failed to apply corrections', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      joinLoading = false;
    }
  }

  async function handleManualCorrection(
    dataValue: string,
    basemapValue: string
  ): Promise<void> {
    if (
      !selectedDataset ||
      !datasetIdForOrchestrator ||
      !dataTabState.geolocation.linkedVariableName
    )
      return;

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    const corrections: Record<string, string> = { [dataValue]: basemapValue };

    try {
      joinLoading = true;
      await duckDBOrchestrator.applyJoinCorrections(
        datasetIdForOrchestrator,
        dataTabState.geolocation.linkedVariableName,
        corrections
      );

      if (abortSignal.aborted) return;

      const basemap = allBasemaps.find((b) => b.file === basemapSelected);
      if (basemap) {
        const stats = await duckDBOrchestrator.computeJoinStats(
          datasetIdForOrchestrator,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );

        if (abortSignal.aborted) return;

        dataTabActions.setJoinStats(stats);

        if (stats.unrecognizedCount > 0) {
          fetchBasemapAttributeValues(basemap);
        } else {
          basemapAttributeValues = [];
        }

        const hasBlocking = hasBlockingJoinIssues(stats);

        if (!hasBlocking && stats.joinedCount > 0) {
          await duckDBOrchestrator.finalizeJoin(
            datasetIdForOrchestrator,
            basemap,
            dataTabState.geolocation.linkedVariableName
          );
          dataTabStore.markStepComplete(basemapStepIndex);
          logger.success(
            'Manual correction applied and join finalized',
            LogCategory.MAP
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      logger.error('Failed to apply manual correction', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      joinLoading = false;
    }
  }

  async function handleFinalizeJoin() {
    if (
      !selectedDataset ||
      !datasetIdForOrchestrator ||
      !dataTabState.geolocation.linkedVariableName
    )
      return;

    const basemap = allBasemaps.find((b) => b.file === basemapSelected);
    if (!basemap) {
      logger.warn('No basemap selected for join finalization', LogCategory.MAP);
      return;
    }

    const hasBlocking = hasBlockingJoinIssues({
      joinedCount,
      toVerifyCount,
      duplicateCount: duplicates.length
    });
    if (hasBlocking) {
      logger.warn(
        'Cannot finalize join with unresolved entities',
        LogCategory.MAP,
        {
          toVerify: toVerifyCount,
          duplicates: duplicates.length
        }
      );
      return;
    }

    if (joinedCount === 0) {
      logger.warn(
        'Cannot finalize join with zero matched entities',
        LogCategory.MAP
      );
      return;
    }

    try {
      joinLoading = true;
      logger.info('Finalizing join to enable map rendering', LogCategory.MAP, {
        datasetId: selectedDataset.id,
        basemap: basemap.file
      });

      await duckDBOrchestrator.finalizeJoin(
        datasetIdForOrchestrator,
        basemap,
        dataTabState.geolocation.linkedVariableName
      );

      dataTabStore.markStepComplete(basemapStepIndex);

      logger.success('Join finalized, map should update', LogCategory.MAP);
    } catch (error) {
      logger.error('Failed to finalize join', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      joinLoading = false;
    }
  }

  async function loadSuggestions() {
    if (!selectedDataset) return;

    try {
      if (!basemapCatalogService.isLoaded) {
        await basemapCatalogService.loadCatalog();
      }

      const processedDataset = normalizeToProcessedDataset(selectedDataset);
      const geoColumn = dataTabState.geolocation.linkedVariableName;
      let suggestions: BasemapSuggestion[] = [];

      // GPS mode: use bbox comparison for suggestions
      if (hasGPSCoordinates() && datasetIdForOrchestrator) {
        const gpsBounds = await duckDBOrchestrator.getGPSBounds(
          datasetIdForOrchestrator
        );
        if (gpsBounds) {
          suggestions =
            basemapCatalogService.getSuggestionsByGPSBbox(gpsBounds);
        }
      } else {
        suggestions = await basemapCatalogService.getSuggestions(
          processedDataset,
          3,
          geoColumn
        );

        // Re-rank suggestions using actual join quality when possible
        if (geoColumn && datasetIdForOrchestrator) {
          try {
            const synthesis = await duckDBOrchestrator.computeJoinSynthesis(
              datasetIdForOrchestrator,
              geoColumn
            );
            if (synthesis.length > 0) {
              const scoreMap = new Map(
                synthesis.map((s) => [s.basemap, s.shareCandidate])
              );
              suggestions = suggestions
                .map((s) => ({
                  ...s,
                  matchScore: scoreMap.get(s.file) ?? s.matchScore
                }))
                .sort((a, b) => b.matchScore - a.matchScore);
            }
          } catch (err) {
            logger.warn(
              'Join synthesis unavailable, using heuristic ranking',
              LogCategory.MAP,
              err
            );
          }
        }
      }

      basemapSuggestions = suggestions;

      const currentDatasetIdentity = getDatasetIdentity(selectedDataset);
      const isDatasetChanged =
        suggestionsDatasetIdentity !== currentDatasetIdentity;
      suggestionsDatasetIdentity = currentDatasetIdentity;

      if (
        suggestions.length > 0 &&
        !osmBasemapStore.isActive &&
        !selectedDataset?.geometry &&
        !projectStore.currentProject?.data?.basemap?.id &&
        (isDatasetChanged ||
          !dataTabState.basemapJoin.selectedBasemap ||
          !hasAvailableBasemap(dataTabState.basemapJoin.selectedBasemap))
      ) {
        await autoSelectFirstSuggestedBasemap();
      }
    } catch (error) {
      logger.error(
        'Failed to load basemap suggestions',
        LogCategory.MAP,
        error
      );
      basemapSuggestions = [];
    }
  }

  $effect(() => {
    const controller = new AbortController();

    async function initializeBasemapCatalog() {
      try {
        await basemapCatalogService.loadCatalog();
        if (controller.signal.aborted) return;

        await loadSuggestions();
        if (controller.signal.aborted) return;

        const savedBasemap = projectStore.currentProject?.data?.basemap;
        if (savedBasemap?.id) {
          dataTabActions.selectBasemap(savedBasemap.id);
          basemapStyleStore.setReferenceBasemap(
            savedBasemap.type === 'osm' ? null : savedBasemap.id
          );

          if (
            (savedBasemap.type === 'custom' || savedBasemap.type === 'osm') &&
            savedBasemap.data
          ) {
            const customBasemapData =
              savedBasemap.data as unknown as BasemapMetadata;
            basemapCatalogService.addCustomBasemap(customBasemapData);
            if (savedBasemap.type === 'custom') {
              basemapService.registerCustomBasemapMetadata(customBasemapData);
            }

            if (savedBasemap.type === 'osm') {
              osmBasemapStore.setOSMBasemap(customBasemapData);
            }
          }

          if (!selectedDataset || !datasetIdForOrchestrator) return;

          const basemap = allBasemaps.find((b) => b.file === savedBasemap.id);
          if (!basemap) return;

          if (
            savedBasemap.type === 'osm' ||
            isOSMBasemapId(basemap.file) ||
            hasGPSCoordinates()
          ) {
            const datasetReady = await waitForDatasetAvailability(
              datasetIdForOrchestrator,
              controller.signal
            );
            if (controller.signal.aborted || !datasetReady) return;

            joinLoading = true;
            try {
              await duckDBOrchestrator.finalizeJoin(
                datasetIdForOrchestrator,
                basemap,
                ''
              );
              if (controller.signal.aborted) return;

              dataTabActions.clearJoinStats();
              dataTabStore.markStepComplete(basemapStepIndex);
              previousJoinContext = `${datasetIdForOrchestrator}::${basemap.file}`;
              previousLinkedVariableName =
                dataTabState.geolocation.linkedVariableName || null;
            } catch (error) {
              if (controller.signal.aborted) return;
              logger.error(
                'Failed to restore GPS/OSM join',
                LogCategory.MAP,
                error
              );
            } finally {
              joinLoading = false;
            }
            return;
          }

          if (!dataTabState.geolocation.linkedVariableName) return;

          const datasetReady = await waitForDatasetAvailability(
            datasetIdForOrchestrator,
            controller.signal
          );
          if (controller.signal.aborted || !datasetReady) return;

          joinLoading = true;
          try {
            const stats = await duckDBOrchestrator.computeJoinStats(
              datasetIdForOrchestrator,
              basemap,
              dataTabState.geolocation.linkedVariableName
            );
            if (controller.signal.aborted) return;
            dataTabActions.setJoinStats(stats);
            if (stats.unrecognizedCount > 0) {
              fetchBasemapAttributeValues(basemap);
            }
            previousJoinContext = `${datasetIdForOrchestrator}::${basemap.file}`;
            previousLinkedVariableName =
              dataTabState.geolocation.linkedVariableName || null;

            if (!hasBlockingJoinIssues(stats) && stats.joinedCount > 0) {
              await duckDBOrchestrator.finalizeJoin(
                datasetIdForOrchestrator,
                basemap,
                dataTabState.geolocation.linkedVariableName
              );
              if (controller.signal.aborted) return;
              dataTabStore.markStepComplete(basemapStepIndex);
              logger.success(
                'Join restored and finalized after project reload',
                LogCategory.MAP
              );
            }
          } catch (error) {
            if (controller.signal.aborted) return;
            logger.error(
              'Failed to restore join stats',
              LogCategory.MAP,
              error
            );
          } finally {
            joinLoading = false;
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error(
          'Failed to initialize basemap catalog',
          LogCategory.MAP,
          error
        );
      }
    }

    void initializeBasemapCatalog();

    return () => {
      controller.abort();
    };
  });

  $effect(() => {
    void dataTabState.geolocation.linkedVariableName;
    if (selectedDataset) {
      void loadSuggestions();
    }
  });

  $effect(() => {
    void basemapSuggestions.length;
    void basemapSelected;

    if (
      basemapSuggestions.length > 0 &&
      !osmBasemapStore.isActive &&
      !selectedDataset?.geometry &&
      !projectStore.currentProject?.data?.basemap?.id &&
      (!basemapSelected || !hasAvailableBasemap(basemapSelected))
    ) {
      void autoSelectFirstSuggestedBasemap();
    }
  });

  $effect(() => {
    const linkedVariableName = dataTabState.geolocation.linkedVariableName;
    const selectedBasemapId = basemapSelected;
    const resolvedDatasetId = datasetIdForOrchestrator;

    if (!selectedDataset || !selectedBasemapId || !resolvedDatasetId) {
      previousJoinContext = null;
      previousLinkedVariableName = null;
      return;
    }

    if (isOSMBasemapId(selectedBasemapId) || hasGPSCoordinates()) {
      dataTabActions.clearJoinStats();
      previousJoinContext = `${resolvedDatasetId}::${selectedBasemapId}`;
      previousLinkedVariableName = linkedVariableName || null;
      return;
    }

    const joinContext = `${resolvedDatasetId}::${selectedBasemapId}`;
    if (previousJoinContext !== joinContext) {
      previousJoinContext = joinContext;
      previousLinkedVariableName = linkedVariableName || null;
      return;
    }

    if (
      !linkedVariableName ||
      linkedVariableName === previousLinkedVariableName
    ) {
      previousLinkedVariableName = linkedVariableName || null;
      return;
    }

    previousLinkedVariableName = linkedVariableName;

    const basemap = allBasemaps.find((b) => b.file === selectedBasemapId);
    if (!basemap) return;

    logger.info(
      'Recomputing join after linked variable change',
      LogCategory.MAP,
      {
        basemap: selectedBasemapId,
        linkedVariableName
      }
    );

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    dataTabActions.clearJoinStats();
    dataTabStore.resetStepCompletion(basemapStepIndex);

    void computeAndAutoFinalizeJoin(basemap, abortSignal, linkedVariableName);
  });

  // Restore step completion after project reload when GPS join was already finalized
  $effect(() => {
    if (dataTabStore.hasCompletedStep[basemapStepIndex]) return;
    const id = datasetIdForOrchestrator;
    if (!id) return;
    // Use getDatasetBySourceFile since datasetIdForOrchestrator returns sourceFileId
    const duckDataset = duckDBOrchestrator.getDatasetBySourceFile(id);
    if (duckDataset?.gpsMode && duckDataset.joinedBasemap) {
      dataTabStore.markStepComplete(basemapStepIndex);
      logger.info(
        'Join step restored from persisted GPS mode',
        LogCategory.MAP,
        { id }
      );
    }
  });

  let previousDatasetIdentity: string | null = null;
  $effect(() => {
    const currentDatasetIdentity = getDatasetIdentity(selectedDataset);
    const hasDatasets = datasetsStore.datasets.length > 0;

    if (
      shouldResetJoinState({
        previousIdentity: previousDatasetIdentity,
        currentIdentity: currentDatasetIdentity,
        hasDatasets
      })
    ) {
      logger.info(
        'Clearing join state due to dataset change',
        LogCategory.MAP,
        {
          previousDatasetIdentity,
          newDatasetIdentity: currentDatasetIdentity
        }
      );

      if (currentJoinAbortController) {
        currentJoinAbortController.abort();
        currentJoinAbortController = null;
      }

      osmBasemapStore.clear();
      dataTabActions.clearJoinStats();
      basemapAttributeValues = [];
      dataTabActions.selectBasemap('');
      basemapStyleStore.setReferenceBasemap(null);
      dataTabStore.resetStepCompletion(basemapStepIndex);
      importedBasemap = null;
      importError = null;
      previousJoinContext = null;
      previousLinkedVariableName = null;
    }

    if (currentDatasetIdentity !== null || !hasDatasets) {
      previousDatasetIdentity = currentDatasetIdentity;
    }
  });
</script>

<section id="basemap-join-step">
  <MainToolBarHeader title={m.basemap_step_title()} icon={Earth} />

  <p class="kh-help">
    {m.basemap_step_description()}
    <InfoPopover text={m.basemap_step_info()} />
  </p>

  <div class="basemap-tabs-wrapper">
    <ToggleTabs
      activeIndex={activeTabIndex}
      items={tabItems}
      onChange={(index) => (activeTabIndex = index)}
    />
  </div>

  {#if activeTabIndex === 0}
    <BasemapCatalogTab
      suggestedBasemaps={suggestedBasemaps()}
      allBasemaps={allBasemaps}
      basemapSelected={basemapSelected}
      onSelectBasemap={handleSelectBasemap}
      onSuggestBasemap={() => (showSuggestionModal = true)}
    />
  {:else if activeTabIndex === 1}
    <BasemapImportTab
      importedBasemap={importedBasemap}
      importError={importError}
      importUploading={importUploading}
      onFileDrop={handleFileDrop}
      onFileInputChange={handleFileInputChange}
      onLoadUrl={handleLoadUrl}
    />
  {:else if activeTabIndex === OSM_TAB_INDEX}
    <BasemapOsmTab
      hasGPSCoordinates={hasGPSCoordinates()}
      onSelectOSM={handleSelectOSM}
      onGoToVisualize={handleGoToVisualize}
    />
  {/if}

  {#if basemapSelected && !isGPSModeActive}
    <hr class="join-separator" />
    <JoinAssistedSection
      joinRows={joinRows}
      duplicates={duplicates}
      unknowns={unknowns}
      joinedCount={joinedCount}
      toVerifyCount={toVerifyCount}
      linkedVariableName={dataTabState.geolocation.linkedVariableName}
      basemapValues={basemapAttributeValues}
      loading={joinLoading}
      joinFinalized={dataTabStore.hasCompletedStep[basemapStepIndex]}
      onApplyCorrections={handleApplyCorrections}
      onFinalizeJoin={handleFinalizeJoin}
      onManualCorrection={handleManualCorrection}
    />
  {/if}
</section>

<BasemapSuggestionModal
  bind:open={showSuggestionModal}
  onClose={() => (showSuggestionModal = false)}
/>

<style>
  #basemap-join-step {
    display: flex;
    flex-direction: column;
  }

  .kh-help {
    color: #6f6f6f;
    margin-bottom: 12px;
    font-size: 14px;
    line-height: 18px;
  }

  .basemap-tabs-wrapper {
    margin-bottom: 12px;
  }

  .join-separator {
    border: none;
    border-top: 1px solid #e0e0e0;
    margin: 0;
  }
</style>
