<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { globalActions } from '$lib/features/commons/store/global.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { hasGPSCoordinateColumns } from '$lib/features/commons/utils/geo-detector.utils';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import { DEFAULT_OSM_STYLE } from '$lib/features/map/constants';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
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
  import { Grid as GridIcon, List, Upload } from 'carbon-icons-svelte';
  import BasemapCatalogTab from './basemap-join-components/basemap-catalog-tab.svelte';
  import BasemapImportTab from './basemap-join-components/basemap-import-tab.svelte';
  import BasemapOsmTab from './basemap-join-components/basemap-osm-tab.svelte';
  import JoinAssistedSection from './basemap-join-components/join-assisted-section.svelte';
  import BasemapSuggestionModal from './components/basemap-suggestion-modal.svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import { dataTabStore } from './data-tab.store.svelte';

  let activeTabIndex = $state(0);

  const tabItems = [
    { icon: List, label: m.basemap_catalog(), iconSize: 20 },
    { icon: Upload, label: m.basemap_import(), iconSize: 20 },
    { icon: GridIcon, label: m.basemap_osm(), iconSize: 20 }
  ];

  const basemapSelected = $derived(dataTabState.basemapJoin.selectedBasemap);
  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const datasetIdForOrchestrator = $derived(
    selectedDataset?.sourceFileId ?? selectedDataset?.id
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

  let currentJoinAbortController: AbortController | null = null;

  const hasGPSCoordinates = $derived(() => {
    if (!selectedDataset) return false;
    const columns = selectedDataset.columns || [];
    return hasGPSCoordinateColumns(columns);
  });

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

  async function handleSelectBasemap(basemap: BasemapMetadata) {
    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    osmBasemapStore.clear();
    dataTabActions.selectBasemap(basemap.file);

    projectStore.updateProjectData({
      basemap: {
        id: basemap.file,
        type: basemap.isCustom ? 'custom' : 'catalog',
        data: basemap.isCustom ? { ...basemap } : undefined
      }
    });

    if (
      selectedDataset &&
      datasetIdForOrchestrator &&
      dataTabState.geolocation.linkedVariableName
    ) {
      try {
        const stats = await duckDBOrchestrator.computeJoinStats(
          datasetIdForOrchestrator,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );

        if (abortSignal.aborted) {
          logger.debug(
            'Join computation cancelled (basemap changed)',
            LogCategory.MAP
          );
          return;
        }

        dataTabActions.setJoinStats(stats);

        const hasErrors =
          stats.toVerifyCount > 0 ||
          stats.entities.filter((e) => e.status === JoinStatus.DUPLICATE)
            .length > 0 ||
          stats.entities.filter((e) => e.status === JoinStatus.UNRECOGNIZED)
            .length > 0;

        if (!hasErrors && stats.joinedCount > 0) {
          logger.info(
            'Auto-finalizing join - no errors detected',
            LogCategory.MAP,
            { joinedCount: stats.joinedCount }
          );

          try {
            await duckDBOrchestrator.finalizeJoin(
              datasetIdForOrchestrator,
              basemap,
              dataTabState.geolocation.linkedVariableName
            );
            dataTabStore.markStepComplete(2);
            logger.success(
              'Join auto-finalized, map should update',
              LogCategory.MAP
            );
          } catch (finalizeError) {
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
        logger.error('Failed to compute join stats', LogCategory.MAP, error);
        showError(m.join_error_title(), m.join_error_message());
      }
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

    importUploading = true;
    importError = null;

    try {
      const file = importFiles[0];
      const { basemap: customBasemap } = await processBasemapImport(file);

      basemapCatalogService.addCustomBasemap(customBasemap);
      osmBasemapStore.clear();
      dataTabActions.selectBasemap(customBasemap.file);
      importedBasemap = customBasemap;

      projectStore.updateProjectData({
        basemap: {
          id: customBasemap.file,
          type: 'custom',
          data: { ...customBasemap }
        }
      });

      if (
        selectedDataset &&
        datasetIdForOrchestrator &&
        dataTabState.geolocation.linkedVariableName
      ) {
        try {
          const stats = await duckDBOrchestrator.computeJoinStats(
            datasetIdForOrchestrator,
            customBasemap,
            dataTabState.geolocation.linkedVariableName
          );
          dataTabActions.setJoinStats(stats);
        } catch (error) {
          logger.error('Failed to compute join stats', LogCategory.MAP, error);
          showError(m.join_error_title(), m.join_error_message());
        }
      }
    } catch (err) {
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

    const osmBasemap = createOSMBasemap(DEFAULT_OSM_STYLE);

    basemapCatalogService.addCustomBasemap(osmBasemap);
    osmBasemapStore.setOSMBasemap(osmBasemap);
    dataTabActions.selectBasemap(osmBasemap.file);

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
      dataTabStore.markStepComplete(2);
      logger.success('OSM basemap activated with GPS mode', LogCategory.MAP);
    } catch (error) {
      logger.error('Failed to activate OSM GPS mode', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    }
  }

  function handleSuggestBasemap() {
    showSuggestionModal = true;
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
      await duckDBOrchestrator.applyJoinCorrections(
        datasetIdForOrchestrator,
        dataTabState.geolocation.linkedVariableName,
        corrections
      );
      dataTabActions.applyCorrections();

      const basemap = allBasemaps.find((b) => b.file === basemapSelected);
      if (basemap) {
        const stats = await duckDBOrchestrator.computeJoinStats(
          datasetIdForOrchestrator,
          basemap,
          dataTabState.geolocation.linkedVariableName
        );
        dataTabActions.setJoinStats(stats);

        await duckDBOrchestrator.finalizeJoin(
          datasetIdForOrchestrator,
          basemap,
          dataTabState.geolocation.linkedVariableName,
          { skipJoinComputation: true }
        );
        dataTabStore.markStepComplete(2);
        logger.success(
          'Corrections applied and join finalized',
          LogCategory.MAP
        );
      }
    } catch (error) {
      logger.error('Failed to apply corrections', LogCategory.MAP, error);
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

    try {
      logger.info('Finalizing join to enable map rendering', LogCategory.MAP, {
        datasetId: selectedDataset.id,
        basemap: basemap.file
      });

      await duckDBOrchestrator.finalizeJoin(
        datasetIdForOrchestrator,
        basemap,
        dataTabState.geolocation.linkedVariableName
      );

      dataTabStore.markStepComplete(2);

      logger.success('Join finalized, map should update', LogCategory.MAP);
    } catch (error) {
      logger.error('Failed to finalize join', LogCategory.MAP, error);
      showError(m.join_error_title(), m.join_error_message());
    }
  }

  async function loadSuggestions() {
    if (!selectedDataset) return;

    try {
      if (!basemapCatalogService.isLoaded) {
        await basemapCatalogService.loadCatalog();
      }

      const processedDataset = normalizeToProcessedDataset(selectedDataset);
      const suggestions = await basemapCatalogService.getSuggestions(
        processedDataset,
        3,
        dataTabState.geolocation.linkedVariableName
      );
      basemapSuggestions = suggestions;
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
    async function initializeBasemapCatalog() {
      try {
        await basemapCatalogService.loadCatalog();
        await loadSuggestions();

        const savedBasemap = projectStore.currentProject?.data?.basemap;
        if (savedBasemap?.id) {
          dataTabActions.selectBasemap(savedBasemap.id);

          if (
            (savedBasemap.type === 'custom' || savedBasemap.type === 'osm') &&
            savedBasemap.data
          ) {
            const customBasemapData =
              savedBasemap.data as unknown as BasemapMetadata;
            basemapCatalogService.addCustomBasemap(customBasemapData);

            if (savedBasemap.type === 'osm') {
              osmBasemapStore.setOSMBasemap(customBasemapData);
            }
          }

          if (
            selectedDataset &&
            datasetIdForOrchestrator &&
            dataTabState.geolocation.linkedVariableName
          ) {
            const basemap = allBasemaps.find((b) => b.file === savedBasemap.id);
            if (basemap) {
              try {
                const stats = await duckDBOrchestrator.computeJoinStats(
                  datasetIdForOrchestrator,
                  basemap,
                  dataTabState.geolocation.linkedVariableName
                );
                dataTabActions.setJoinStats(stats);
              } catch (error) {
                logger.error(
                  'Failed to restore join stats',
                  LogCategory.MAP,
                  error
                );
              }
            }
          }
        }
      } catch (error) {
        logger.error(
          'Failed to initialize basemap catalog',
          LogCategory.MAP,
          error
        );
      }
    }

    initializeBasemapCatalog();
  });

  $effect(() => {
    void dataTabState.geolocation.linkedVariableName;
    if (selectedDataset) {
      loadSuggestions();
    }
  });

  let previousDatasetId: string | null = null;
  $effect(() => {
    const currentDatasetId = selectedDataset?.id ?? null;

    if (previousDatasetId !== null && currentDatasetId !== previousDatasetId) {
      if (osmBasemapStore.isActive) {
        logger.info(
          'Clearing OSM basemap due to dataset change',
          LogCategory.MAP,
          {
            previousDatasetId,
            newDatasetId: currentDatasetId
          }
        );
        osmBasemapStore.clear();
        dataTabActions.selectBasemap('');
      }
    }

    previousDatasetId = currentDatasetId;
  });
</script>

<section id="basemap-join-step">
  <MainToolBarHeader title={m.basemap_step_title()} />

  <p class="kh-help">
    {m.basemap_step_description()}
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
      onSuggestBasemap={handleSuggestBasemap}
      onGoToImport={() => (activeTabIndex = 1)}
    />
  {/if}

  {#if activeTabIndex === 1}
    <BasemapImportTab
      importedBasemap={importedBasemap}
      importError={importError}
      importUploading={importUploading}
      onFileDrop={handleFileDrop}
      onFileInputChange={handleFileInputChange}
      onLoadUrl={handleLoadUrl}
    />
  {/if}

  {#if activeTabIndex === 2}
    <BasemapOsmTab
      hasGPSCoordinates={hasGPSCoordinates()}
      onSelectOSM={handleSelectOSM}
      onGoToVisualize={handleGoToVisualize}
    />
  {/if}

  {#if basemapSelected}
    <JoinAssistedSection
      joinRows={joinRows}
      duplicates={duplicates}
      unknowns={unknowns}
      joinedCount={joinedCount}
      toVerifyCount={toVerifyCount}
      linkedVariableName={dataTabState.geolocation.linkedVariableName}
      onApplyCorrections={handleApplyCorrections}
      onFinalizeJoin={handleFinalizeJoin}
    />
  {/if}
</section>

<BasemapSuggestionModal
  bind:open={showSuggestionModal}
  onClose={() => (showSuggestionModal = false)}
/>

<style>
  #basemap-join-step {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
  }

  .basemap-tabs-wrapper {
    margin-bottom: var(--cds-spacing-05);
  }
</style>
