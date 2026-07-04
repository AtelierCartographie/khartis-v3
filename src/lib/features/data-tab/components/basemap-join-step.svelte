<script lang="ts">
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';

  import { Duck } from '$lib/features/duckdb';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { isMissingDuckTableError } from '$lib/features/duckdb/utils/duckdb-error.utils';
  import { BasemapStyle } from '$lib/features/map/constants';
  import {
    basemapCatalogService,
    rankBasemapsByJoinSynthesis,
    shouldPreferTextBasemapRefinementForGPS
  } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { projectionStore } from '$lib/features/map/stores/projection.store.svelte';
  import type {
    BasemapMetadata,
    BasemapSuggestion
  } from '$lib/features/map/types/basemap.types';
  import {
    createOSMBasemap,
    loadBasemapFromUrl,
    processBasemapImport
  } from '$lib/features/map/services/basemap-import.service';
  import * as m from '$lib/paraglide/messages';
  import { Earth } from 'carbon-icons-svelte';
  import BasemapCatalogTab from './basemap-join/basemap-catalog-tab.svelte';
  import BasemapImportTab from './basemap-join/basemap-import-tab.svelte';
  import BasemapPanelContent from './basemap-join/basemap-panel-content.svelte';
  import JoinAssistedSection from './basemap-join/join-assisted-section.svelte';
  import BasemapSuggestionModal from './basemap-suggestion-modal.svelte';
  import OSMBasemapSelector from './osm-basemap-selector.svelte';
  import MainToolBarHeader from '$lib/features/main-toolbar/components/main-toolbar-header.svelte';
  import { dataTabStore } from '../stores/data-tab.store.svelte';
  import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
  import { resolveSuggestedBasemapAutoSelectionTarget } from '../utils/basemap-auto-selection.utils';
  import {
    getDatasetIdentity,
    shouldResetJoinState
  } from '../utils/dataset-identity.utils';
  import {
    resolveRelevantPersistedBasemap,
    restorePersistedBasemapSelection,
    resolveBasemapSource,
    PERSISTED_BASEMAP_TYPE,
    type PersistedProjectBasemap
  } from '../services/persisted-basemap.service';
  import { resolveNextBasemapSelectionId } from '../utils/basemap-selection.utils';
  import { waitForDatasetAvailability } from '../utils/dataset-availability.utils';
  import { resolveDatasetIdForOrchestrator } from '../utils/dataset-resolution.utils';
  import { persistTabularSourceSnapshot } from '../services/tabular-source-snapshot.service';
  import { useBasemapJoinAttributes } from '../hooks/use-basemap-join-attributes.svelte';
  import { tick, untrack } from 'svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/stores/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import { globalActions } from '$lib/features/commons/stores/global.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { MAP_PROJECTION_TYPE } from '$lib/features/commons/constants';
  import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';
  import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
  import { hasGPSCoordinateColumns } from '$lib/features/commons/utils/geo-detector.utils';
  import type { SerializedProjectData } from '$lib/types/serialization.types';

  function handleBasemapSourceChange(source: BasemapSource): void {
    dataTabActions.setBasemapSource(source);
  }

  const basemapStepIndex = $derived(dataTabStore.basemapStepIndex);
  const basemapSelected = $derived(dataTabState.basemapJoin.selectedBasemap);
  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const duckDBDatasetsVersion = $derived(duckDBOrchestrator.datasetsVersion);
  const datasetIdForOrchestrator = $derived.by(() =>
    resolveDatasetIdForOrchestrator(selectedDataset)
  );
  let basemapSuggestions = $state<BasemapSuggestion[]>([]);

  const joinRows = $derived(dataTabState.basemapJoin.joinMappings);
  const duplicates = $derived(dataTabState.basemapJoin.duplicateEntities);
  const unknowns = $derived(dataTabState.basemapJoin.unrecognizedEntities);
  const joinedCount = $derived(dataTabState.basemapJoin.joinedEntities);
  const toVerifyCount = $derived(dataTabState.basemapJoin.entitiesToVerify);
  const joinedEntitiesList = $derived(
    dataTabState.basemapJoin.joinedEntitiesList
  );
  const ignoredEntities = $derived(
    dataTabState.basemapJoin.ignoredEntities.map((entity) => ({
      dataValue: entity.dataValue,
      lines: entity.lines ?? []
    }))
  );

  const allBasemaps = $derived(basemapCatalogService.catalogBasemaps);
  const allBasemapsForLookup = $derived(basemapCatalogService.basemaps);
  const projectBasemap = $derived(
    (projectStore.currentProject?.data?.basemap as
      PersistedProjectBasemap | undefined) ?? undefined
  );
  const runtimePersistedBasemap = $derived.by(() =>
    resolveRelevantPersistedBasemap({
      selectedDataset,
      sourceFiles: projectStore.currentProject?.data?.sourceFiles,
      projectBasemap,
      selectedBasemapId: basemapSelected,
      selectedBasemapSource: dataTabState.basemapJoin.basemapSource,
      hasMultipleDatasets: datasetsStore.datasets.length > 1
    })
  );
  const persistedReferenceBasemapId = $derived.by(() => {
    const data = projectStore.currentProject?.data as
      SerializedProjectData | undefined;
    const savedReferenceBasemapId =
      data?.basemapSettings?.referenceBasemapId?.trim();
    if (savedReferenceBasemapId) {
      return savedReferenceBasemapId;
    }

    const projectBasemapId = projectBasemap?.id?.trim();
    const persistedBasemapId = runtimePersistedBasemap?.id?.trim();
    if (projectBasemapId && projectBasemapId !== persistedBasemapId) {
      return projectBasemapId;
    }

    return undefined;
  });
  let importFiles = $state<File[]>([]);
  let importUploading = $state(false);
  let importError = $state<string | null>(null);
  let importedBasemap = $state<BasemapMetadata | null>(null);
  let showSuggestionModal = $state(false);
  let joinLoading = $state(false);
  let joinLoadingRequestId = 0;
  let suggestionsDatasetIdentity = $state<string | null>(null);
  let suggestionsGeoColumn = $state<string | null>(null);

  let currentJoinAbortController: AbortController | null = null;
  let previousJoinContext: string | null = null;
  let previousLinkedVariableName: string | null = null;
  let previousFilterKey: string | null = null;
  let loadSuggestionsAbortController: AbortController | null = null;
  let hasDismissedSuggestedBasemap = $state(false);
  const hasGPSCoordinates = $derived.by(() => {
    if (!selectedDataset) return false;
    const columns = selectedDataset.columns || [];
    return hasGPSCoordinateColumns(columns, selectedDataset.geoDetection);
  });
  const isGPSModeActive = $derived(hasGPSCoordinates);

  const suggestedBasemaps = $derived.by(() => {
    return basemapSuggestions
      .map((s: BasemapSuggestion) => ({
        basemap: allBasemapsForLookup.find(
          (b: BasemapMetadata) => b.file === s.file
        ),
        score: s.matchScore
      }))
      .filter((item) => item.basemap !== undefined) as {
      basemap: BasemapMetadata;
      score: number;
    }[];
  });

  const stepTitle = $derived.by(() => {
    const stepNumber = dataTabStore.getDisplayedStepNumber('basemap');
    const title = m.basemap_step_title();

    return stepNumber === null ? title : `${stepNumber}. ${title}`;
  });

  const basemapAttributes = useBasemapJoinAttributes({
    getSelectedBasemapId: () => dataTabState.basemapJoin.selectedBasemap,
    getBasemaps: () => allBasemapsForLookup
  });

  function hasAvailableBasemap(basemapId: string): boolean {
    if (!basemapId) return false;
    return allBasemapsForLookup.some((basemap) => basemap.file === basemapId);
  }

  function applyCatalogReferenceBasemap(basemap: BasemapMetadata): void {
    basemapStyleStore.setReferenceBasemap(basemap.file);
    projectStore.updateProjectData({
      basemap: {
        id: basemap.file,
        type: basemap.isCustom
          ? PERSISTED_BASEMAP_TYPE.CUSTOM
          : PERSISTED_BASEMAP_TYPE.CATALOG,
        data: basemap.isCustom ? { ...basemap } : undefined
      }
    });
  }

  async function autoSelectFirstSuggestedBasemap(): Promise<void> {
    if (basemapSuggestions.length === 0) return;

    const firstSuggestion = allBasemapsForLookup.find(
      (basemap) => basemap.file === basemapSuggestions[0]?.file
    );

    if (!firstSuggestion) return;

    await handleSelectBasemap(firstSuggestion, { allowToggleOff: false });
  }

  function isDatasetNotFoundError(
    error: unknown,
    datasetId = datasetIdForOrchestrator
  ): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    if (error.message === m.error_dataset_not_found()) {
      return true;
    }

    if (!datasetId || !isMissingDuckTableError(error)) {
      return false;
    }

    return (
      !datasetsStore.getDatasetBySourceFile(datasetId) &&
      !duckDBOrchestrator.getDatasetBySourceFile(datasetId) &&
      !duckDBOrchestrator.getDataset(datasetId)
    );
  }

  function beginJoinLoading(): number {
    const requestId = ++joinLoadingRequestId;
    joinLoading = true;
    return requestId;
  }

  function endJoinLoading(requestId: number): void {
    if (requestId === joinLoadingRequestId) {
      joinLoading = false;
    }
  }

  function cancelJoinLoading(): void {
    joinLoadingRequestId += 1;
    joinLoading = false;
  }

  function abortCurrentJoin(): void {
    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
      currentJoinAbortController = null;
    }
    cancelJoinLoading();
  }

  function isOSMBasemapId(basemapId: string): boolean {
    return basemapId.startsWith('osm_');
  }

  function getCurrentFilterKey(tableName: string | undefined): string {
    if (!tableName) return '[]';

    return JSON.stringify(
      duckDBOrchestrator
        .getFilters(tableName)
        .map(({ column, operator, value, secondaryValue, limit }) => ({
          column,
          operator,
          value,
          secondaryValue,
          limit
        }))
    );
  }

  function abortLoadSuggestions(): void {
    if (!loadSuggestionsAbortController) {
      return;
    }

    loadSuggestionsAbortController.abort();
    loadSuggestionsAbortController = null;
  }

  type PersistedJoinSnapshot = {
    joinedBasemap?: string;
    geoColumn?: string;
    gpsMode?: boolean;
    gpsColumns?: { lat: string; lon: string };
    joinCorrections?: Record<string, string>;
  };

  type SourceSnapshot = {
    sourceFileId: string;
    tableName: string;
  };

  function resolveSourceSnapshot(): SourceSnapshot | null {
    const sourceFileId = selectedDataset?.sourceFileId;
    const tableName = selectedDataset?.tableName;

    if (!sourceFileId || !tableName) {
      return null;
    }

    return {
      sourceFileId,
      tableName
    };
  }

  function getCurrentDuckDataset(resolvedDatasetId = datasetIdForOrchestrator) {
    if (!resolvedDatasetId) {
      return null;
    }

    return (
      duckDBOrchestrator.getDatasetBySourceFile(resolvedDatasetId) ??
      duckDBOrchestrator.getDataset(resolvedDatasetId)
    );
  }

  function resolveGPSJoinSnapshot(
    fallbackBasemapId: string,
    resolvedDatasetId = datasetIdForOrchestrator
  ): PersistedJoinSnapshot {
    const duckDataset = getCurrentDuckDataset(resolvedDatasetId);

    return {
      joinedBasemap: duckDataset?.joinedBasemap ?? fallbackBasemapId,
      geoColumn: undefined,
      gpsMode: true,
      gpsColumns: duckDataset?.gpsColumns
    };
  }

  function isGPSJoinFinalizedForBasemap(
    basemapId: string,
    resolvedDatasetId = datasetIdForOrchestrator
  ): boolean {
    const duckDataset = getCurrentDuckDataset(resolvedDatasetId);

    return Boolean(
      duckDataset?.gpsMode &&
      duckDataset.joinedBasemap === basemapId &&
      duckDataset.gpsColumns?.lat &&
      duckDataset.gpsColumns?.lon
    );
  }

  function isCatalogJoinFinalizedForBasemap(
    basemapId: string,
    geoColumn: string,
    resolvedDatasetId = datasetIdForOrchestrator
  ): boolean {
    const duckDataset = getCurrentDuckDataset(resolvedDatasetId);

    return Boolean(
      duckDataset &&
      !duckDataset.gpsMode &&
      duckDataset.joinedBasemap === basemapId &&
      duckDataset.geoColumn === geoColumn
    );
  }

  function hasCurrentJoinStats(): boolean {
    return (
      joinedCount > 0 ||
      toVerifyCount > 0 ||
      duplicates.length > 0 ||
      unknowns.length > 0 ||
      joinedEntitiesList.length > 0 ||
      ignoredEntities.length > 0 ||
      joinRows.length > 0
    );
  }

  async function finalizeGPSJoinIfNeeded(
    basemap: BasemapMetadata,
    resolvedDatasetId: string
  ): Promise<void> {
    if (isGPSJoinFinalizedForBasemap(basemap.file, resolvedDatasetId)) {
      return;
    }

    await duckDBOrchestrator.finalizeJoin(resolvedDatasetId, basemap, '');
  }

  async function persistJoinSnapshot(
    joinState: PersistedJoinSnapshot = {},
    sourceSnapshot = resolveSourceSnapshot()
  ) {
    if (!sourceSnapshot || !Duck) {
      return;
    }

    const { sourceFileId, tableName } = sourceSnapshot;

    const duckColumns = await Duck.analyse(tableName, {
      force: true
    });

    await persistTabularSourceSnapshot({
      sourceFileId,
      tableName,
      duckColumns,
      joinState
    });
  }

  async function computeAndAutoFinalizeJoin(
    basemap: BasemapMetadata,
    abortSignal: AbortSignal,
    linkedVariableName = dataTabState.geolocation.linkedVariableName
  ): Promise<boolean> {
    const resolvedDatasetId = datasetIdForOrchestrator;
    const sourceSnapshot = resolveSourceSnapshot();
    const stepIndex = basemapStepIndex;
    if (!selectedDataset || !resolvedDatasetId || !linkedVariableName) {
      return false;
    }
    // Guard against a stale linked variable that no longer maps to a real
    // column (e.g. a CSV re-import collapsed the table). Computing the join on
    // a missing column never settles and pins the reactive effects in a loop,
    // freezing the UI.
    if (
      !selectedDataset.columns?.some((col) => col.name === linkedVariableName)
    ) {
      return false;
    }
    if (isOSMBasemapId(basemap.file) || hasGPSCoordinates) {
      return false;
    }

    const loadingRequestId = beginJoinLoading();
    try {
      const datasetReady = await waitForDatasetAvailability(resolvedDatasetId, {
        abortSignal
      });

      if (abortSignal.aborted) return false;

      if (!datasetReady) {
        return false;
      }

      const stats = await duckDBOrchestrator.computeJoinStats(
        resolvedDatasetId,
        basemap,
        linkedVariableName
      );

      if (abortSignal.aborted) {
        return false;
      }

      dataTabActions.setJoinStats(stats);

      if (stats.unrecognizedCount === 0 && stats.joinedCount === 0) {
        basemapAttributes.clearValues();
      }

      if (stats.joinedCount === 0) {
        dataTabStore.resetStepCompletion(stepIndex);
        return false;
      }

      if (dataTabState.geolocation.linkedVariableName !== linkedVariableName) {
        return false;
      }

      const currentDuckDataset =
        duckDBOrchestrator.getDataset(resolvedDatasetId);
      if (
        currentDuckDataset?.joinedBasemap === basemap.file &&
        currentDuckDataset.geoColumn &&
        currentDuckDataset.geoColumn !== linkedVariableName
      ) {
        return false;
      }

      try {
        await duckDBOrchestrator.finalizeJoin(
          resolvedDatasetId,
          basemap,
          linkedVariableName
        );
        if (abortSignal.aborted) return false;

        await persistJoinSnapshot(
          {
            joinedBasemap: basemap.file,
            geoColumn: linkedVariableName,
            gpsMode: false,
            gpsColumns: undefined
          },
          sourceSnapshot
        );
        if (abortSignal.aborted) return false;

        syncSelectedDatasetJoinedBasemap(basemap.file);
        dataTabStore.markStepComplete(stepIndex);
        return true;
      } catch (finalizeError) {
        if (
          abortSignal.aborted ||
          isDatasetNotFoundError(finalizeError, resolvedDatasetId)
        ) {
          return false;
        }

        logger.error(
          'Failed to auto-finalize join',
          LogCategory.MAP,
          finalizeError
        );
        showError(m.join_error_title(), m.join_error_message());
        return false;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return false;
      }

      if (
        abortSignal.aborted ||
        isDatasetNotFoundError(error, resolvedDatasetId)
      ) {
        return false;
      }

      logger.error('Failed to compute join stats', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
      return false;
    } finally {
      endJoinLoading(loadingRequestId);
    }
  }

  async function handleSelectBasemap(
    basemap: BasemapMetadata,
    options: { allowToggleOff?: boolean } = {}
  ) {
    const resolvedDatasetId = datasetIdForOrchestrator;
    const sourceSnapshot = resolveSourceSnapshot();
    const hasGPSMode = hasGPSCoordinates;
    const stepIndex = basemapStepIndex;
    const nextBasemapId = resolveNextBasemapSelectionId(
      basemapSelected || undefined,
      basemap.file,
      options
    );

    if (!nextBasemapId) {
      clearSelectedBasemap();
      hasDismissedSuggestedBasemap = true;
      return;
    }

    hasDismissedSuggestedBasemap = false;

    if (
      hasGPSMode &&
      resolvedDatasetId &&
      nextBasemapId === basemapSelected &&
      isGPSJoinFinalizedForBasemap(basemap.file, resolvedDatasetId) &&
      basemapStyleStore.referenceBasemapId === basemap.file
    ) {
      dataTabStore.markStepComplete(stepIndex);
      return;
    }

    abortCurrentJoin();
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    osmBasemapStore.clear();
    dataTabActions.clearJoinStats();
    basemapAttributes.clearValues();
    dataTabStore.resetStepCompletion(stepIndex);
    dataTabActions.setBasemapJoinState({
      selectedBasemap: basemap.file,
      basemapSource: BasemapSource.CATALOG
    });

    const previousReferenceBasemapId = basemapStyleStore.referenceBasemapId;
    const isCached = basemapService.getCachedBasemap(basemap.file) !== null;
    if (isCached) {
      basemapStyleStore.setReferenceBasemap(basemap.file);
    }
    // When not cached: keep previousReferenceBasemapId rendering during the
    // async join so the map does not flash empty. applyCatalogReferenceBasemap
    // will swap to the new basemap once the join is finalized.

    if (hasGPSMode && resolvedDatasetId) {
      try {
        await finalizeGPSJoinIfNeeded(basemap, resolvedDatasetId);
        if (abortSignal.aborted) return;

        await persistJoinSnapshot(
          resolveGPSJoinSnapshot(basemap.file, resolvedDatasetId),
          sourceSnapshot
        );
        if (abortSignal.aborted) return;

        syncSelectedDatasetJoinedBasemap(basemap.file);
        dataTabStore.markStepComplete(stepIndex);
        applyCatalogReferenceBasemap(basemap);
      } catch (error) {
        if (
          abortSignal.aborted ||
          isDatasetNotFoundError(error, resolvedDatasetId)
        ) {
          return;
        }

        if (isCached) {
          basemapStyleStore.setReferenceBasemap(previousReferenceBasemapId);
        }
        logger.error(
          'Failed to finalize GPS mode for catalog basemap',
          LogCategory.MAP,
          error
        );
        showError(m.join_error_title(), m.join_error_message());
      }
    } else {
      const didFinalizeJoin = await computeAndAutoFinalizeJoin(
        basemap,
        abortSignal
      );
      if (abortSignal.aborted) return;
      // Always apply the basemap the user explicitly picked, even if the join
      // produced zero matches. Without this, clicking a basemap that does not
      // match the data (e.g. country-coded dataset on a canton basemap) would
      // silently keep the previous basemap, making the catalog feel broken.
      // The join stats panel surfaces the mismatch separately.
      applyCatalogReferenceBasemap(basemap);
      if (!didFinalizeJoin) {
        dataTabStore.resetStepCompletion(stepIndex);
        if (resolvedDatasetId) {
          const duckDataset =
            duckDBOrchestrator.getDatasetBySourceFile(resolvedDatasetId) ??
            duckDBOrchestrator.getDataset(resolvedDatasetId);
          if (duckDataset) {
            duckDBOrchestrator.updateDatasetJoinInfo(duckDataset.id, {
              joinedBasemap: undefined,
              geoColumn: undefined,
              gpsMode: false,
              gpsColumns: undefined
            });
          }
        }
      }
    }
  }

  function clearSelectedBasemap(): void {
    abortCurrentJoin();

    const resolvedDatasetId = datasetIdForOrchestrator;
    const duckDataset = resolvedDatasetId
      ? (duckDBOrchestrator.getDatasetBySourceFile(resolvedDatasetId) ??
        duckDBOrchestrator.getDataset(resolvedDatasetId))
      : null;

    if (duckDataset) {
      duckDBOrchestrator.updateDatasetJoinInfo(duckDataset.id, {
        joinedBasemap: undefined,
        geoColumn: undefined,
        gpsMode: false,
        gpsColumns: undefined
      });
    }

    osmBasemapStore.clear();
    dataTabActions.clearJoinStats();
    basemapAttributes.clearValues();
    dataTabActions.setBasemapJoinState({
      selectedBasemap: '',
      basemapSource: dataTabState.basemapJoin.basemapSource
    });
    basemapStyleStore.setReferenceBasemap(null);
    dataTabStore.resetStepCompletion(basemapStepIndex);
    projectStore.updateProjectData({ basemap: undefined });
    projectionStore.clear();
    previousJoinContext = null;
    previousLinkedVariableName = null;
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

    const resolvedDatasetId = datasetIdForOrchestrator;
    const sourceSnapshot = resolveSourceSnapshot();
    const hasGPSMode = hasGPSCoordinates;
    const stepIndex = basemapStepIndex;

    abortCurrentJoin();
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    importUploading = true;
    importError = null;
    dataTabActions.clearJoinStats();
    dataTabStore.resetStepCompletion(stepIndex);

    try {
      const file = importFiles[0];
      const { basemap: customBasemap, geometryTable } =
        await processBasemapImport(file);

      if (abortSignal.aborted) return;

      basemapCatalogService.addCustomBasemap(customBasemap);
      hasDismissedSuggestedBasemap = false;
      osmBasemapStore.clear();
      dataTabActions.setBasemapJoinState({
        selectedBasemap: customBasemap.file,
        basemapSource: BasemapSource.IMPORT
      });
      await basemapService.registerCustomBasemap(customBasemap, geometryTable);
      basemapStyleStore.setReferenceBasemap(customBasemap.file);
      importedBasemap = customBasemap;

      projectStore.updateProjectData({
        basemap: {
          id: customBasemap.file,
          type: PERSISTED_BASEMAP_TYPE.CUSTOM,
          data: { ...customBasemap }
        }
      });

      if (hasGPSMode && resolvedDatasetId) {
        await finalizeGPSJoinIfNeeded(customBasemap, resolvedDatasetId);
        if (abortSignal.aborted) return;

        await persistJoinSnapshot(
          resolveGPSJoinSnapshot(customBasemap.file, resolvedDatasetId),
          sourceSnapshot
        );
        if (abortSignal.aborted) return;

        syncSelectedDatasetJoinedBasemap(customBasemap.file);
        dataTabStore.markStepComplete(stepIndex);
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
    if (!hasGPSCoordinates) {
      return;
    }

    if (!selectedDataset) {
      return;
    }

    abortCurrentJoin();
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    const resolvedDatasetId = datasetIdForOrchestrator;
    const sourceSnapshot = resolveSourceSnapshot();
    const stepIndex = basemapStepIndex;

    dataTabActions.clearJoinStats();
    dataTabStore.resetStepCompletion(stepIndex);

    const referenceStyle =
      basemapStyleStore.lastSelectedTiledStyle ?? BasemapStyle.MONDE_COULEURS;
    const osmBasemap = createOSMBasemap(referenceStyle);

    hasDismissedSuggestedBasemap = false;
    basemapCatalogService.addCustomBasemap(osmBasemap);
    osmBasemapStore.setOSMBasemap(osmBasemap);
    if (mapProjectionStore.isGlobe) {
      mapProjectionStore.setProjection(MAP_PROJECTION_TYPE.MERCATOR);
    }
    dataTabActions.setBasemapJoinState({
      selectedBasemap: osmBasemap.file,
      basemapSource: BasemapSource.OSM
    });
    basemapStyleStore.setReferenceBasemap(null);
    basemapStyleStore.setStyle(referenceStyle);
    basemapStyleStore.requestViewportReset(referenceStyle);

    projectStore.updateProjectData({
      basemap: {
        id: osmBasemap.file,
        type: PERSISTED_BASEMAP_TYPE.OSM,
        data: { ...osmBasemap }
      }
    });

    if (!resolvedDatasetId) {
      return;
    }

    try {
      await finalizeGPSJoinIfNeeded(osmBasemap, resolvedDatasetId);
      if (abortSignal.aborted) return;

      await persistJoinSnapshot(
        resolveGPSJoinSnapshot(osmBasemap.file, resolvedDatasetId),
        sourceSnapshot
      );
      if (abortSignal.aborted) return;

      syncSelectedDatasetJoinedBasemap(osmBasemap.file);
      dataTabStore.markStepComplete(stepIndex);
    } catch (error) {
      if (
        abortSignal.aborted ||
        isDatasetNotFoundError(error, resolvedDatasetId)
      ) {
        return;
      }

      logger.error('Failed to activate OSM GPS mode', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    }
  }

  function handleGoToVisualize() {
    globalActions.setNavigationState(ToolbarStep.Visualizations);
  }

  function getSourceFileForSnapshot(
    sourceSnapshot: SourceSnapshot | null
  ): UploadedFile | undefined {
    if (!sourceSnapshot) return undefined;
    return projectStore.currentProject?.data?.sourceFiles?.find(
      (file) => file.id === sourceSnapshot.sourceFileId
    );
  }

  function mergeJoinCorrections(
    existing: Record<string, string> | undefined,
    addition: Record<string, string>
  ): Record<string, string> {
    const merged: Record<string, string> = { ...(existing ?? {}) };
    for (const [original, corrected] of Object.entries(addition)) {
      const previous = merged[original];
      if (previous && previous !== corrected) {
        merged[previous] = corrected;
        delete merged[original];
      } else if (corrected === original) {
        delete merged[original];
      } else {
        merged[original] = corrected;
      }
    }
    return merged;
  }

  async function handleManualCorrection(
    dataValue: string,
    basemapValue: string
  ): Promise<void> {
    const resolvedDatasetId = datasetIdForOrchestrator;
    const linkedVariableName = dataTabState.geolocation.linkedVariableName;
    const selectedBasemapId = basemapSelected;
    const sourceSnapshot = resolveSourceSnapshot();
    const stepIndex = basemapStepIndex;

    if (!selectedDataset || !resolvedDatasetId || !linkedVariableName) return;

    abortCurrentJoin();
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    const correction: Record<string, string> = { [dataValue]: basemapValue };
    const existingSourceFile = getSourceFileForSnapshot(sourceSnapshot);
    const persistedCorrections = mergeJoinCorrections(
      existingSourceFile?.joinCorrections,
      correction
    );

    const loadingRequestId = beginJoinLoading();
    try {
      await duckDBOrchestrator.applyJoinCorrections(
        resolvedDatasetId,
        linkedVariableName,
        correction
      );
      if (abortSignal.aborted) return;

      await persistJoinSnapshot(
        {
          joinedBasemap: selectedBasemapId || undefined,
          geoColumn: linkedVariableName,
          gpsMode: false,
          gpsColumns: undefined,
          joinCorrections: persistedCorrections
        },
        sourceSnapshot
      );

      if (abortSignal.aborted) return;

      const basemap = allBasemapsForLookup.find(
        (b) => b.file === selectedBasemapId
      );
      if (basemap) {
        const stats = await duckDBOrchestrator.computeJoinStats(
          resolvedDatasetId,
          basemap,
          linkedVariableName
        );

        if (abortSignal.aborted) return;

        dataTabActions.setJoinStats(stats);

        if (stats.unrecognizedCount > 0 || stats.joinedCount > 0) {
          basemapAttributes.fetchValues(basemap);
        } else {
          basemapAttributes.clearValues();
        }

        if (stats.joinedCount > 0) {
          await duckDBOrchestrator.finalizeJoin(
            resolvedDatasetId,
            basemap,
            linkedVariableName
          );
          if (abortSignal.aborted) return;

          await persistJoinSnapshot(
            {
              joinedBasemap: basemap.file,
              geoColumn: linkedVariableName,
              gpsMode: false,
              gpsColumns: undefined,
              joinCorrections: persistedCorrections
            },
            sourceSnapshot
          );
          if (abortSignal.aborted) return;

          syncSelectedDatasetJoinedBasemap(basemap.file);
          dataTabStore.markStepComplete(stepIndex);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      logger.error('Failed to apply manual correction', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      endJoinLoading(loadingRequestId);
    }
  }

  async function handleIgnoreEntity(
    dataValue: string,
    source: 'joined' | 'to_verify' | 'unrecognized',
    basemapValue?: string
  ): Promise<void> {
    dataTabActions.ignoreEntity({ dataValue, source, basemapValue });
    await tick();
    await handleFinalizeJoin();
  }

  function handleRestoreEntity(dataValue: string): void {
    dataTabActions.restoreEntity(dataValue);
  }

  async function handleValidateEntity(
    dataValue: string,
    basemapValue: string
  ): Promise<void> {
    if (!basemapValue) return;
    dataTabActions.promoteToJoined(dataValue, basemapValue);
    if (dataValue !== basemapValue) {
      await handleManualCorrection(dataValue, basemapValue);
      return;
    }
    await handleFinalizeJoin();
  }

  function syncSelectedDatasetJoinedBasemap(joinedBasemap: string): void {
    const datasetId = selectedDataset?.id;
    if (!datasetId) return;
    datasetsStore.updateDatasetJoinBasemap(datasetId, joinedBasemap);
  }

  async function handleFinalizeJoin() {
    const resolvedDatasetId = datasetIdForOrchestrator;
    const linkedVariableName = dataTabState.geolocation.linkedVariableName;
    const sourceSnapshot = resolveSourceSnapshot();
    const stepIndex = basemapStepIndex;

    if (!selectedDataset || !resolvedDatasetId || !linkedVariableName) return;

    const basemap = allBasemapsForLookup.find(
      (b) => b.file === basemapSelected
    );
    if (!basemap) {
      return;
    }

    if (joinedCount === 0) {
      return;
    }

    const loadingRequestId = beginJoinLoading();
    try {
      await duckDBOrchestrator.finalizeJoin(
        resolvedDatasetId,
        basemap,
        linkedVariableName
      );
      await persistJoinSnapshot(
        {
          joinedBasemap: basemap.file,
          geoColumn: linkedVariableName,
          gpsMode: false,
          gpsColumns: undefined
        },
        sourceSnapshot
      );
      syncSelectedDatasetJoinedBasemap(basemap.file);

      dataTabStore.markStepComplete(stepIndex);
    } catch (error) {
      logger.error('Failed to finalize join', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      endJoinLoading(loadingRequestId);
    }
  }

  async function loadSuggestions() {
    if (!selectedDataset) return;

    abortLoadSuggestions();
    const controller = new AbortController();
    loadSuggestionsAbortController = controller;
    const datasetSnapshot = selectedDataset;
    const requestedDatasetIdentity = getDatasetIdentity(datasetSnapshot);
    const resolvedDatasetId = datasetIdForOrchestrator;
    const rawGeoColumn = dataTabState.geolocation.linkedVariableName;
    // Ignore a linked variable that no longer exists as a column (e.g. after a
    // CSV re-import collapsed the table) so we never grade the join on a
    // phantom column, which loops the reactive effects and freezes the UI.
    const geoColumn =
      rawGeoColumn &&
      datasetSnapshot.columns?.some((col) => col.name === rawGeoColumn)
        ? rawGeoColumn
        : '';
    const hasGPSMode = hasGPSCoordinates;
    const selectedBasemapId = dataTabState.basemapJoin.selectedBasemap;
    const persistedBasemapId = runtimePersistedBasemap?.id;
    const hasDatasetGeometry = Boolean(datasetSnapshot.geometry);
    const processedDataset = normalizeToProcessedDataset(datasetSnapshot);

    try {
      if (
        selectedBasemapId &&
        basemapSuggestions.length > 0 &&
        suggestionsDatasetIdentity === requestedDatasetIdentity &&
        suggestionsGeoColumn === (geoColumn ?? null) &&
        hasAvailableBasemap(selectedBasemapId)
      ) {
        return;
      }

      if (!basemapCatalogService.isLoaded) {
        await basemapCatalogService.loadCatalog();
        if (controller.signal.aborted) return;
      }

      if (resolvedDatasetId) {
        const datasetReady = await waitForDatasetAvailability(
          resolvedDatasetId,
          { abortSignal: controller.signal }
        );
        if (controller.signal.aborted) return;

        if (!datasetReady) {
          basemapSuggestions = [];
          suggestionsGeoColumn = null;
          return;
        }
      }

      let suggestions: BasemapSuggestion[] = [];

      if (hasGPSMode && resolvedDatasetId) {
        let gpsSuggestions: BasemapSuggestion[] = [];
        const gpsBounds =
          await duckDBOrchestrator.getGPSBounds(resolvedDatasetId);
        if (controller.signal.aborted) return;

        if (gpsBounds) {
          gpsSuggestions =
            basemapCatalogService.getSuggestionsByGPSBbox(gpsBounds);
        }
        suggestions = gpsSuggestions;

        const textGeoColumns =
          processedDataset.geoDetection?.geoColumns?.filter(
            (column) =>
              column.type !== GEO_COLUMN_TYPE.LATITUDE &&
              column.type !== GEO_COLUMN_TYPE.LONGITUDE
          ) ?? [];
        let bestTextSuggestions: BasemapSuggestion[] = [];
        let bestTextScore = 0;

        for (const column of textGeoColumns) {
          try {
            const synthesis = await duckDBOrchestrator.computeJoinSynthesis(
              resolvedDatasetId,
              column.columnName
            );
            if (controller.signal.aborted) return;

            const ranked = rankBasemapsByJoinSynthesis(
              basemapCatalogService.basemaps,
              synthesis,
              3
            );
            const topScore = ranked[0]?.matchScore ?? 0;

            if (topScore > bestTextScore) {
              bestTextScore = topScore;
              bestTextSuggestions = ranked;
            }
          } catch (error) {
            if (isDatasetNotFoundError(error)) {
              continue;
            }
          }
        }

        if (
          shouldPreferTextBasemapRefinementForGPS(
            gpsSuggestions,
            bestTextScore
          ) &&
          bestTextSuggestions.length > 0
        ) {
          suggestions = bestTextSuggestions;
        }
      } else {
        if (geoColumn && resolvedDatasetId) {
          try {
            const synthesis = await duckDBOrchestrator.computeJoinSynthesis(
              resolvedDatasetId,
              geoColumn
            );
            if (controller.signal.aborted) return;

            suggestions = rankBasemapsByJoinSynthesis(
              basemapCatalogService.basemaps,
              synthesis,
              3
            );
          } catch (err) {
            if (isDatasetNotFoundError(err)) {
              return;
            }
          }
        }

        if (suggestions.length === 0) {
          suggestions = basemapCatalogService.getSuggestions(
            processedDataset,
            3,
            geoColumn
          );
        }
      }

      if (controller.signal.aborted) return;

      basemapSuggestions = suggestions;
      suggestionsGeoColumn = geoColumn ?? null;

      const isDatasetChanged =
        suggestionsDatasetIdentity !== requestedDatasetIdentity;
      suggestionsDatasetIdentity = requestedDatasetIdentity;

      const autoSelectionTarget = resolveSuggestedBasemapAutoSelectionTarget({
        hasDismissedSuggestedBasemap,
        suggestionCount: suggestions.length,
        isOSMActive: osmBasemapStore.isActive,
        hasDatasetGeometry,
        persistedBasemapId,
        selectedBasemapId,
        hasSelectedAvailableBasemap: hasAvailableBasemap(selectedBasemapId),
        shouldRetryForDatasetChange: isDatasetChanged
      });

      if (controller.signal.aborted) return;

      if (autoSelectionTarget === 'suggested') {
        await autoSelectFirstSuggestedBasemap();
      }
    } catch (error) {
      logger.error(
        'Failed to load basemap suggestions',
        LogCategory.MAP,
        error
      );
      basemapSuggestions = [];
    } finally {
      if (loadSuggestionsAbortController === controller) {
        loadSuggestionsAbortController = null;
      }
    }
  }

  $effect(() => {
    const controller = new AbortController();
    // Reactive dep: restore the active dataset's persisted basemap on tab switch too, not only on mount (else blank map).
    void getDatasetIdentity(selectedDataset);

    async function initializeBasemapCatalog() {
      const stepIndex = basemapStepIndex;

      try {
        await basemapCatalogService.loadCatalog();
        if (controller.signal.aborted) return;

        await loadSuggestions();
        if (controller.signal.aborted) return;

        const savedBasemap = runtimePersistedBasemap;
        if (savedBasemap?.id) {
          await restorePersistedBasemapSelection(savedBasemap, {
            referenceBasemapId: persistedReferenceBasemapId
          });
          if (controller.signal.aborted) return;

          dataTabActions.setBasemapSource(
            resolveBasemapSource(savedBasemap.type)
          );

          const resolvedDatasetId = datasetIdForOrchestrator;
          const linkedVariableName =
            dataTabState.geolocation.linkedVariableName || null;
          const sourceSnapshot = resolveSourceSnapshot();

          if (!selectedDataset || !resolvedDatasetId) return;

          const basemap = allBasemapsForLookup.find(
            (b) => b.file === savedBasemap.id
          );
          if (!basemap) return;

          const shouldRestoreOSMGPSJoin =
            hasGPSCoordinates &&
            (savedBasemap.type === PERSISTED_BASEMAP_TYPE.OSM ||
              isOSMBasemapId(basemap.file));

          if (shouldRestoreOSMGPSJoin) {
            const datasetReady = await waitForDatasetAvailability(
              resolvedDatasetId,
              { abortSignal: controller.signal }
            );
            if (controller.signal.aborted || !datasetReady) return;

            const loadingRequestId = beginJoinLoading();
            try {
              await finalizeGPSJoinIfNeeded(basemap, resolvedDatasetId);
              if (controller.signal.aborted) return;

              await persistJoinSnapshot(
                resolveGPSJoinSnapshot(basemap.file, resolvedDatasetId),
                sourceSnapshot
              );
              if (controller.signal.aborted) return;

              syncSelectedDatasetJoinedBasemap(basemap.file);
              dataTabActions.clearJoinStats();
              dataTabStore.markStepComplete(stepIndex);
              previousJoinContext = `${resolvedDatasetId}::${basemap.file}`;
              previousLinkedVariableName = linkedVariableName;
            } catch (error) {
              if (controller.signal.aborted) return;
              logger.error(
                'Failed to restore GPS/OSM join',
                LogCategory.MAP,
                error
              );
            } finally {
              endJoinLoading(loadingRequestId);
            }
            return;
          }

          if (!linkedVariableName) return;

          const datasetReady = await waitForDatasetAvailability(
            resolvedDatasetId,
            { abortSignal: controller.signal }
          );
          if (controller.signal.aborted || !datasetReady) return;

          const joinContext = `${resolvedDatasetId}::${basemap.file}`;
          const filterKey = getCurrentFilterKey(selectedDataset?.tableName);
          if (
            isCatalogJoinFinalizedForBasemap(
              basemap.file,
              linkedVariableName,
              resolvedDatasetId
            )
          ) {
            syncSelectedDatasetJoinedBasemap(basemap.file);
            dataTabStore.markStepComplete(stepIndex);
            previousJoinContext = joinContext;
            previousLinkedVariableName = linkedVariableName;
            previousFilterKey = filterKey;

            if (hasCurrentJoinStats()) {
              basemapAttributes.requestValues();
              return;
            }

            const loadingRequestId = beginJoinLoading();
            try {
              const stats = await duckDBOrchestrator.computeJoinStats(
                resolvedDatasetId,
                basemap,
                linkedVariableName
              );
              if (controller.signal.aborted) return;
              dataTabActions.setJoinStats(stats);
              if (stats.unrecognizedCount > 0 || stats.joinedCount > 0) {
                basemapAttributes.fetchValues(basemap);
              }
              if (stats.joinedCount === 0) {
                dataTabStore.resetStepCompletion(stepIndex);
              }
            } catch (error) {
              if (controller.signal.aborted) return;
              logger.error(
                'Failed to restore join stats',
                LogCategory.MAP,
                error
              );
            } finally {
              endJoinLoading(loadingRequestId);
            }
            return;
          }

          const loadingRequestId = beginJoinLoading();
          try {
            const persistedCorrections =
              getSourceFileForSnapshot(sourceSnapshot)?.joinCorrections;
            if (
              persistedCorrections &&
              Object.keys(persistedCorrections).length > 0
            ) {
              await duckDBOrchestrator.applyJoinCorrections(
                resolvedDatasetId,
                linkedVariableName,
                persistedCorrections
              );
              if (controller.signal.aborted) return;
            }

            const stats = await duckDBOrchestrator.computeJoinStats(
              resolvedDatasetId,
              basemap,
              linkedVariableName
            );
            if (controller.signal.aborted) return;
            dataTabActions.setJoinStats(stats);
            if (stats.unrecognizedCount > 0 || stats.joinedCount > 0) {
              basemapAttributes.fetchValues(basemap);
            }
            previousJoinContext = joinContext;
            previousLinkedVariableName = linkedVariableName;
            previousFilterKey = filterKey;

            if (stats.joinedCount === 0) {
              dataTabStore.resetStepCompletion(stepIndex);
              return;
            }

            await duckDBOrchestrator.finalizeJoin(
              resolvedDatasetId,
              basemap,
              linkedVariableName
            );
            if (controller.signal.aborted) return;
            syncSelectedDatasetJoinedBasemap(basemap.file);
            dataTabStore.markStepComplete(stepIndex);
          } catch (error) {
            if (controller.signal.aborted) return;
            logger.error(
              'Failed to restore join stats',
              LogCategory.MAP,
              error
            );
          } finally {
            endJoinLoading(loadingRequestId);
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
      abortLoadSuggestions();
    };
  });

  $effect(() => {
    const datasetSnapshot = selectedDataset;
    const columnsKey =
      datasetSnapshot?.columns
        ?.map((column) => `${column.name}:${column.type}`)
        .join('|') ?? '';

    void duckDBDatasetsVersion;
    void dataTabState.geolocation.linkedVariableName;
    void getDatasetIdentity(datasetSnapshot);
    void datasetSnapshot?.tableName;
    void datasetSnapshot?.rowCount;
    void datasetSnapshot?.geometry;
    void columnsKey;

    if (selectedDataset) {
      void untrack(() => loadSuggestions());
    } else {
      abortLoadSuggestions();
    }

    return () => {
      abortLoadSuggestions();
    };
  });

  $effect(() => {
    void basemapSuggestions.length;
    void basemapSelected;

    const autoSelectionTarget = resolveSuggestedBasemapAutoSelectionTarget({
      hasDismissedSuggestedBasemap,
      suggestionCount: basemapSuggestions.length,
      isOSMActive: osmBasemapStore.isActive,
      hasDatasetGeometry: Boolean(selectedDataset?.geometry),
      persistedBasemapId: runtimePersistedBasemap?.id,
      selectedBasemapId: basemapSelected,
      hasSelectedAvailableBasemap: hasAvailableBasemap(basemapSelected)
    });

    if (autoSelectionTarget === 'suggested') {
      void autoSelectFirstSuggestedBasemap();
    }
  });

  $effect(() => {
    void duckDBDatasetsVersion;
    const linkedVariableName = dataTabState.geolocation.linkedVariableName;
    const selectedBasemapId = basemapSelected;
    const resolvedDatasetId = datasetIdForOrchestrator;
    const filterKey = getCurrentFilterKey(selectedDataset?.tableName);

    if (!selectedDataset || !selectedBasemapId || !resolvedDatasetId) {
      previousJoinContext = null;
      previousLinkedVariableName = null;
      previousFilterKey = null;
      return;
    }

    if (isOSMBasemapId(selectedBasemapId) || hasGPSCoordinates) {
      dataTabActions.clearJoinStats();
      previousJoinContext = `${resolvedDatasetId}::${selectedBasemapId}`;
      previousLinkedVariableName = linkedVariableName || null;
      previousFilterKey = filterKey;
      return;
    }

    const joinContext = `${resolvedDatasetId}::${selectedBasemapId}`;
    if (previousJoinContext !== joinContext) {
      previousJoinContext = joinContext;
      previousLinkedVariableName = linkedVariableName || null;
      previousFilterKey = filterKey;
      return;
    }

    const filtersChanged = filterKey !== previousFilterKey;
    const linkedVariableChanged =
      linkedVariableName !== previousLinkedVariableName;

    if (!linkedVariableName) {
      previousLinkedVariableName = linkedVariableName || null;
      previousFilterKey = filterKey;
      return;
    }

    if (!linkedVariableChanged && !filtersChanged) {
      previousLinkedVariableName = linkedVariableName || null;
      previousFilterKey = filterKey;
      return;
    }

    previousLinkedVariableName = linkedVariableName;
    previousFilterKey = filterKey;

    const basemap = allBasemapsForLookup.find(
      (b) => b.file === selectedBasemapId
    );
    if (!basemap) return;

    if (
      !filtersChanged &&
      isCatalogJoinFinalizedForBasemap(
        selectedBasemapId,
        linkedVariableName,
        resolvedDatasetId
      )
    ) {
      dataTabStore.markStepComplete(basemapStepIndex);
      return;
    }

    const existingDuckDataset = getCurrentDuckDataset(resolvedDatasetId);
    if (
      !filtersChanged &&
      existingDuckDataset &&
      !existingDuckDataset.gpsMode &&
      existingDuckDataset.joinedBasemap === selectedBasemapId &&
      existingDuckDataset.geoColumn &&
      existingDuckDataset.geoColumn !== linkedVariableName
    ) {
      const canonicalGeoColumn = existingDuckDataset.geoColumn;
      const linkedVariable =
        selectedDataset?.columns
          ?.filter(
            (col) =>
              col.name !== INTERNAL_COLUMN.GEOMETRY &&
              col.name !== INTERNAL_COLUMN.ID
          )
          .findIndex((col) => col.name === canonicalGeoColumn) ?? -1;
      dataTabActions.setGeolocationState({
        linkedVariable: linkedVariable >= 0 ? linkedVariable : null,
        linkedVariableName: canonicalGeoColumn
      });
      previousLinkedVariableName = canonicalGeoColumn;
      dataTabStore.markStepComplete(basemapStepIndex);
      return;
    }

    abortCurrentJoin();
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    if (linkedVariableChanged) {
      dataTabActions.clearJoinStats();
      dataTabStore.resetStepCompletion(basemapStepIndex);
    }

    void computeAndAutoFinalizeJoin(basemap, abortSignal, linkedVariableName);
  });

  // Row mutations (deleting rows, removing filtered rows) change which entities
  // exist but leave the linked variable and filters untouched, so the main join
  // effect above short-circuits and the grading buckets go stale. Re-grade when
  // the dataset row count changes. Loop-safe: finalizing a join never changes
  // the row count, and the baseline resets on dataset switch (handled above).
  let gradeBaselineDatasetId: string | null | undefined = null;
  let gradeBaselineRowCount: number | null = null;
  $effect(() => {
    const datasetId = datasetIdForOrchestrator;
    const rowCount = selectedDataset?.rowCount ?? null;

    if (datasetId !== gradeBaselineDatasetId) {
      gradeBaselineDatasetId = datasetId;
      gradeBaselineRowCount = rowCount;
      return;
    }
    if (rowCount === gradeBaselineRowCount) return;
    gradeBaselineRowCount = rowCount;

    const selectedBasemapId = basemapSelected;
    const linkedVariableName = dataTabState.geolocation.linkedVariableName;
    if (!datasetId || !selectedBasemapId || !linkedVariableName) return;
    if (isOSMBasemapId(selectedBasemapId) || hasGPSCoordinates) return;

    const basemap = allBasemapsForLookup.find(
      (b) => b.file === selectedBasemapId
    );
    if (!basemap) return;

    abortCurrentJoin();
    currentJoinAbortController = new AbortController();
    void computeAndAutoFinalizeJoin(
      basemap,
      currentJoinAbortController.signal,
      linkedVariableName
    );
  });

  $effect(() => {
    void duckDBDatasetsVersion;
    if (dataTabStore.hasCompletedStep[basemapStepIndex]) return;
    const id = datasetIdForOrchestrator;
    if (!id) return;

    const duckDataset = duckDBOrchestrator.getDatasetBySourceFile(id);
    if (duckDataset?.gpsMode && duckDataset.joinedBasemap) {
      dataTabStore.markStepComplete(basemapStepIndex);
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
      abortCurrentJoin();

      osmBasemapStore.clear();
      dataTabActions.clearJoinStats();
      basemapAttributes.clearValues();
      dataTabActions.setBasemapJoinState({
        selectedBasemap: '',
        basemapSource: BasemapSource.CATALOG
      });
      basemapStyleStore.setReferenceBasemap(null);
      dataTabStore.resetStepCompletion(basemapStepIndex);
      importedBasemap = null;
      importError = null;
      previousJoinContext = null;
      previousLinkedVariableName = null;
      hasDismissedSuggestedBasemap = false;
    }

    if (currentDatasetIdentity !== null || !hasDatasets) {
      previousDatasetIdentity = currentDatasetIdentity;
    }
  });
</script>

{#snippet catalogContent()}
  <BasemapCatalogTab
    suggestedBasemaps={suggestedBasemaps}
    allBasemaps={allBasemaps}
    basemapSelected={basemapSelected}
    onSelectBasemap={handleSelectBasemap}
    onSuggestBasemap={() => (showSuggestionModal = true)}
  />
{/snippet}

{#snippet importContent()}
  <BasemapImportTab
    importedBasemap={importedBasemap}
    importError={importError}
    importUploading={importUploading}
    onFileDrop={handleFileDrop}
    onFileInputChange={handleFileInputChange}
    onLoadUrl={handleLoadUrl}
  />
{/snippet}

{#snippet osmContent()}
  <OSMBasemapSelector
    hasGPSCoordinates={hasGPSCoordinates}
    isActive={dataTabState.basemapJoin.basemapSource === BasemapSource.OSM &&
      isOSMBasemapId(basemapSelected)}
    onSelectOSM={handleSelectOSM}
    onGoToVisualize={handleGoToVisualize}
  />
{/snippet}

{#snippet joinSection()}
  <JoinAssistedSection
    joinRows={joinRows}
    duplicates={duplicates}
    unknowns={unknowns}
    joinedCount={joinedCount}
    toVerifyCount={toVerifyCount}
    linkedVariableName={dataTabState.geolocation.linkedVariableName}
    basemapValues={basemapAttributes.values}
    loading={joinLoading}
    joinFinalized={dataTabStore.hasCompletedStep[basemapStepIndex]}
    joinedEntitiesList={joinedEntitiesList}
    ignoredEntities={ignoredEntities}
    duplicateLines={dataTabState.basemapJoin.duplicateLines}
    basemapAliasesByValue={basemapAttributes.aliasesByValue}
    onRequestBasemapValues={basemapAttributes.requestValues}
    onFinalizeJoin={handleFinalizeJoin}
    onManualCorrection={handleManualCorrection}
    onMappingChange={dataTabActions.updateJoinMapping}
    onIgnoreEntity={handleIgnoreEntity}
    onRestoreEntity={handleRestoreEntity}
    onValidateEntity={handleValidateEntity}
  />
{/snippet}

<section id="basemap-join-step">
  <MainToolBarHeader title={stepTitle} icon={Earth} showDivider />

  <p class="kh-help">{m.basemap_step_description()}</p>

  <div class="step-content">
    <BasemapPanelContent
      selectedSource={dataTabState.basemapJoin.basemapSource}
      onSourceChange={handleBasemapSourceChange}
      catalogContent={catalogContent}
      importContent={importContent}
      osmContent={osmContent}
      joinSection={joinSection}
      showJoinSection={!!basemapSelected && !isGPSModeActive}
    />
  </div>
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
    color: var(--cds-text-helper, #6f6f6f);
    margin: 0 16px 12px;
    padding-top: 16px;
    font-size: 14px;
    line-height: 18px;
  }

  .step-content {
    padding: 0 16px 16px;
  }
</style>
