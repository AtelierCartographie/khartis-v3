<script lang="ts">
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { globalActions } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { MAP_PROJECTION_TYPE } from '$lib/features/commons/constants';
  import { GEO_COLUMN_TYPE } from '$lib/features/commons/constants/data.constants';
  import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
  import { PERSISTED_BASEMAP_TYPE } from './services/persisted-basemap';
  import { hasGPSCoordinateColumns } from '$lib/features/commons/utils/geo-detector.utils';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';

  import { Duck } from '$lib/features/duckdb';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { BasemapStyle } from '$lib/features/map/constants';
  import {
    basemapCatalogService,
    rankBasemapsByJoinSynthesis,
    shouldPreferTextBasemapRefinementForGPS
  } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
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
  } from '$lib/features/map/utils/basemap-import.utils';
  import * as m from '$lib/paraglide/messages';
  import { Earth } from 'carbon-icons-svelte';
  import BasemapCatalogTab from './basemap-join-components/basemap-catalog-tab.svelte';
  import BasemapImportTab from './basemap-join-components/basemap-import-tab.svelte';
  import BasemapPanelContent from './basemap-join-components/basemap-panel-content.svelte';
  import JoinAssistedSection from './basemap-join-components/join-assisted-section.svelte';
  import BasemapSuggestionModal from './components/basemap-suggestion-modal.svelte';
  import OSMBasemapSelector from './components/osm-basemap-selector.svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import { dataTabStore } from './data-tab.store.svelte';
  import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
  import { resolveSuggestedBasemapAutoSelectionTarget } from './services/basemap-auto-selection';
  import {
    getDatasetIdentity,
    shouldResetJoinState
  } from './services/dataset-identity';
  import {
    resolveRelevantPersistedBasemap,
    restorePersistedBasemapSelection,
    resolveBasemapSource,
    type PersistedProjectBasemap
  } from './services/persisted-basemap';
  import { resolveNextBasemapSelectionId } from './services/basemap-selection';
  import { resolveDatasetIdForOrchestrator } from './services/dataset-resolution';
  import { persistTabularSourceSnapshot } from './services/tabular-source-snapshot';
  import { hasBlockingJoinIssues } from './services/join-validation';

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
  const runtimePersistedBasemap = $derived.by(() =>
    resolveRelevantPersistedBasemap({
      selectedDataset,
      sourceFiles: projectStore.currentProject?.data?.sourceFiles,
      projectBasemap:
        (projectStore.currentProject?.data?.basemap as
          | PersistedProjectBasemap
          | undefined) ?? undefined,
      selectedBasemapId: basemapSelected,
      selectedBasemapSource: dataTabState.basemapJoin.basemapSource,
      hasMultipleDatasets: datasetsStore.datasets.length > 1
    })
  );
  let importFiles = $state<File[]>([]);
  let importUploading = $state(false);
  let importError = $state<string | null>(null);
  let importedBasemap = $state<BasemapMetadata | null>(null);
  let showSuggestionModal = $state(false);
  let joinLoading = $state(false);
  let suggestionsDatasetIdentity = $state<string | null>(null);
  let basemapAttributeValues = $state<string[]>([]);
  let basemapAliasesByValue = $state<Record<string, string[]>>({});

  let currentJoinAbortController: AbortController | null = null;
  let previousJoinContext: string | null = null;
  let previousLinkedVariableName: string | null = null;
  let previousFilterKey: string | null = null;
  let loadSuggestionsAbortController: AbortController | null = null;
  let hasDismissedSuggestedBasemap = $state(false);
  const DATASET_READY_RETRY_DELAY_MS = 200;
  const DATASET_READY_MAX_RETRIES = 15;

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

  function hasAvailableBasemap(basemapId: string): boolean {
    if (!basemapId) return false;
    return allBasemapsForLookup.some((basemap) => basemap.file === basemapId);
  }

  async function autoSelectFirstSuggestedBasemap(): Promise<void> {
    if (basemapSuggestions.length === 0) return;

    const firstSuggestion = allBasemapsForLookup.find(
      (basemap) => basemap.file === basemapSuggestions[0]?.file
    );

    if (!firstSuggestion) return;

    await handleSelectBasemap(firstSuggestion, { allowToggleOff: false });
  }

  function isMissingDuckTableError(error: unknown): boolean {
    return (
      error instanceof Error &&
      /Catalog Error:\s*Table with name .*?(does not exist|not found)/i.test(
        error.message
      )
    );
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

    duckDBOrchestrator
      .getBasemapAttributeAliasesByValue(basemap)
      .then((aliases) => {
        basemapAliasesByValue = aliases;
      })
      .catch((error) => {
        logger.error(
          'Failed to fetch basemap attribute aliases',
          LogCategory.MAP,
          error
        );
        basemapAliasesByValue = {};
      });
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
  ): Promise<void> {
    const resolvedDatasetId = datasetIdForOrchestrator;
    const sourceSnapshot = resolveSourceSnapshot();
    const stepIndex = basemapStepIndex;
    if (!selectedDataset || !resolvedDatasetId || !linkedVariableName) return;
    if (isOSMBasemapId(basemap.file) || hasGPSCoordinates) return;

    joinLoading = true;
    try {
      const datasetReady = await waitForDatasetAvailability(
        resolvedDatasetId,
        abortSignal
      );

      if (abortSignal.aborted) return;

      if (!datasetReady) {
        logger.warn(
          'Dataset not available after retries — join computation skipped',
          LogCategory.MAP,
          { datasetId: resolvedDatasetId }
        );
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

      if (stats.unrecognizedCount > 0 || stats.joinedCount > 0) {
        fetchBasemapAttributeValues(basemap);
      } else {
        basemapAttributeValues = [];
      }

      const hasBlocking = hasBlockingJoinIssues(stats);

      if (hasBlocking || stats.joinedCount === 0) {
        dataTabStore.resetStepCompletion(stepIndex);
        return;
      }

      try {
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
            gpsColumns: undefined
          },
          sourceSnapshot
        );
        if (abortSignal.aborted) return;

        dataTabStore.markStepComplete(stepIndex);
      } catch (finalizeError) {
        if (
          abortSignal.aborted ||
          isDatasetNotFoundError(finalizeError, resolvedDatasetId)
        ) {
          return;
        }

        logger.error(
          'Failed to auto-finalize join',
          LogCategory.MAP,
          finalizeError
        );
        showError(m.join_error_title(), m.join_error_message());
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      if (
        abortSignal.aborted ||
        isDatasetNotFoundError(error, resolvedDatasetId)
      ) {
        return;
      }

      logger.error('Failed to compute join stats', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      joinLoading = false;
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

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    osmBasemapStore.clear();
    dataTabActions.clearJoinStats();
    basemapAttributeValues = [];
    dataTabStore.resetStepCompletion(stepIndex);
    dataTabActions.setBasemapJoinState({
      selectedBasemap: basemap.file,
      basemapSource: BasemapSource.CATALOG
    });
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

    if (hasGPSMode && resolvedDatasetId) {
      try {
        await duckDBOrchestrator.finalizeJoin(resolvedDatasetId, basemap, '');
        if (abortSignal.aborted) return;

        await persistJoinSnapshot(
          resolveGPSJoinSnapshot(basemap.file, resolvedDatasetId),
          sourceSnapshot
        );
        if (abortSignal.aborted) return;

        dataTabStore.markStepComplete(stepIndex);
      } catch (error) {
        if (
          abortSignal.aborted ||
          isDatasetNotFoundError(error, resolvedDatasetId)
        ) {
          return;
        }

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

  function clearSelectedBasemap(): void {
    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
      currentJoinAbortController = null;
    }

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
    basemapAttributeValues = [];
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

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
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
        await duckDBOrchestrator.finalizeJoin(
          resolvedDatasetId,
          customBasemap,
          ''
        );
        if (abortSignal.aborted) return;

        await persistJoinSnapshot(
          resolveGPSJoinSnapshot(customBasemap.file, resolvedDatasetId),
          sourceSnapshot
        );
        if (abortSignal.aborted) return;

        dataTabStore.markStepComplete(stepIndex);
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
    if (!hasGPSCoordinates) {
      return;
    }

    if (!selectedDataset) {
      logger.warn('No dataset selected for OSM basemap', LogCategory.MAP);
      return;
    }

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
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
    osmBasemapStore.clear();
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
      logger.warn('No dataset ID for orchestrator', LogCategory.MAP);
      return;
    }

    try {
      await duckDBOrchestrator.finalizeJoin(resolvedDatasetId, osmBasemap, '');
      if (abortSignal.aborted) return;

      await persistJoinSnapshot(
        resolveGPSJoinSnapshot(osmBasemap.file, resolvedDatasetId),
        sourceSnapshot
      );
      if (abortSignal.aborted) return;

      dataTabStore.markStepComplete(stepIndex);
      logger.success('OSM basemap activated with GPS mode', LogCategory.MAP);
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

  async function _handleApplyCorrections() {
    const resolvedDatasetId = datasetIdForOrchestrator;
    const linkedVariableName = dataTabState.geolocation.linkedVariableName;
    const selectedBasemapId = basemapSelected;
    const sourceSnapshot = resolveSourceSnapshot();
    const stepIndex = basemapStepIndex;

    if (!selectedDataset || !resolvedDatasetId || !linkedVariableName) return;

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
        resolvedDatasetId,
        linkedVariableName,
        corrections
      );
      if (abortSignal.aborted) return;

      await persistJoinSnapshot(
        {
          joinedBasemap: selectedBasemapId || undefined,
          geoColumn: linkedVariableName,
          gpsMode: false,
          gpsColumns: undefined
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

        if (abortSignal.aborted) {
          return;
        }

        dataTabActions.setJoinStats(stats);

        if (stats.unrecognizedCount > 0 || stats.joinedCount > 0) {
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
            gpsColumns: undefined
          },
          sourceSnapshot
        );
        if (abortSignal.aborted) return;

        dataTabStore.markStepComplete(stepIndex);
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
        // The previous correction has already mutated the column to `previous`,
        // so the row currently keyed by `previous` is the one being remapped.
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

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    const correction: Record<string, string> = { [dataValue]: basemapValue };
    const existingSourceFile = getSourceFileForSnapshot(sourceSnapshot);
    const persistedCorrections = mergeJoinCorrections(
      existingSourceFile?.joinCorrections,
      correction
    );

    try {
      joinLoading = true;
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
          fetchBasemapAttributeValues(basemap);
        } else {
          basemapAttributeValues = [];
        }

        const hasBlocking = hasBlockingJoinIssues(stats);

        if (!hasBlocking && stats.joinedCount > 0) {
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

          dataTabStore.markStepComplete(stepIndex);
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

  function handleIgnoreEntity(
    dataValue: string,
    source: 'joined' | 'to_verify' | 'unrecognized',
    basemapValue?: string
  ): void {
    dataTabActions.ignoreEntity({ dataValue, source, basemapValue });
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

  async function handleFinalizeJoin() {
    const resolvedDatasetId = datasetIdForOrchestrator;
    const linkedVariableName = dataTabState.geolocation.linkedVariableName;
    const sourceSnapshot = resolveSourceSnapshot();
    const selectedDatasetId = selectedDataset?.id;
    const stepIndex = basemapStepIndex;

    if (!selectedDataset || !resolvedDatasetId || !linkedVariableName) return;

    const basemap = allBasemapsForLookup.find(
      (b) => b.file === basemapSelected
    );
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
        datasetId: selectedDatasetId,
        basemap: basemap.file
      });

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

      dataTabStore.markStepComplete(stepIndex);

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

    abortLoadSuggestions();
    const controller = new AbortController();
    loadSuggestionsAbortController = controller;
    const datasetSnapshot = selectedDataset;
    const requestedDatasetIdentity = getDatasetIdentity(datasetSnapshot);
    const resolvedDatasetId = datasetIdForOrchestrator;
    const geoColumn = dataTabState.geolocation.linkedVariableName;
    const hasGPSMode = hasGPSCoordinates;
    const selectedBasemapId = dataTabState.basemapJoin.selectedBasemap;
    const persistedBasemapId = runtimePersistedBasemap?.id;
    const hasDatasetGeometry = Boolean(datasetSnapshot.geometry);
    const processedDataset = normalizeToProcessedDataset(datasetSnapshot);

    try {
      if (!basemapCatalogService.isLoaded) {
        await basemapCatalogService.loadCatalog();
        if (controller.signal.aborted) return;
      }

      if (resolvedDatasetId) {
        const datasetReady = await waitForDatasetAvailability(
          resolvedDatasetId,
          controller.signal
        );
        if (controller.signal.aborted) return;

        if (!datasetReady) {
          basemapSuggestions = [];
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

            logger.warn(
              'Join synthesis unavailable, falling back to heuristic ranking',
              LogCategory.MAP,
              err
            );
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

    async function initializeBasemapCatalog() {
      const stepIndex = basemapStepIndex;

      try {
        await basemapCatalogService.loadCatalog();
        if (controller.signal.aborted) return;

        await loadSuggestions();
        if (controller.signal.aborted) return;

        const savedBasemap = runtimePersistedBasemap;
        if (savedBasemap?.id) {
          await restorePersistedBasemapSelection(savedBasemap);
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
              controller.signal
            );
            if (controller.signal.aborted || !datasetReady) return;

            joinLoading = true;
            try {
              await duckDBOrchestrator.finalizeJoin(
                resolvedDatasetId,
                basemap,
                ''
              );
              if (controller.signal.aborted) return;

              await persistJoinSnapshot(
                resolveGPSJoinSnapshot(basemap.file, resolvedDatasetId),
                sourceSnapshot
              );
              if (controller.signal.aborted) return;

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
              joinLoading = false;
            }
            return;
          }

          if (!linkedVariableName) return;

          const datasetReady = await waitForDatasetAvailability(
            resolvedDatasetId,
            controller.signal
          );
          if (controller.signal.aborted || !datasetReady) return;

          joinLoading = true;
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
              fetchBasemapAttributeValues(basemap);
            }
            previousJoinContext = `${resolvedDatasetId}::${basemap.file}`;
            previousLinkedVariableName = linkedVariableName;

            if (hasBlockingJoinIssues(stats) || stats.joinedCount === 0) {
              dataTabStore.resetStepCompletion(stepIndex);
              return;
            }

            await duckDBOrchestrator.finalizeJoin(
              resolvedDatasetId,
              basemap,
              linkedVariableName
            );
            if (controller.signal.aborted) return;
            dataTabStore.markStepComplete(stepIndex);
            logger.success(
              'Join restored and finalized after project reload',
              LogCategory.MAP
            );
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
      abortLoadSuggestions();
    };
  });

  $effect(() => {
    void duckDBDatasetsVersion;
    void dataTabState.geolocation.linkedVariableName;
    if (selectedDataset) {
      void loadSuggestions();
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

    logger.info(
      'Recomputing join after data-tab state change',
      LogCategory.MAP,
      {
        basemap: selectedBasemapId,
        filterKey,
        filtersChanged,
        linkedVariableName
      }
    );

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    if (linkedVariableChanged) {
      dataTabActions.clearJoinStats();
      dataTabStore.resetStepCompletion(basemapStepIndex);
    }

    void computeAndAutoFinalizeJoin(basemap, abortSignal, linkedVariableName);
  });

  $effect(() => {
    void duckDBDatasetsVersion;
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
    basemapValues={basemapAttributeValues}
    loading={joinLoading}
    joinFinalized={dataTabStore.hasCompletedStep[basemapStepIndex]}
    joinedEntitiesList={joinedEntitiesList}
    ignoredEntities={ignoredEntities}
    duplicateLines={dataTabState.basemapJoin.duplicateLines}
    basemapAliasesByValue={basemapAliasesByValue}
    onFinalizeJoin={handleFinalizeJoin}
    onManualCorrection={handleManualCorrection}
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
