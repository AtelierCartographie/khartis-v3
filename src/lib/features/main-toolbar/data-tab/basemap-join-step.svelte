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
  import { resolveDatasetIdForOrchestrator } from './services/dataset-resolution';

  let activeTabIndex = $state(0);

  const tabItems = [
    { icon: List, label: m.basemap_catalog(), iconSize: 20 },
    { icon: Upload, label: m.basemap_import(), iconSize: 20 },
    { icon: Earth, label: m.basemap_osm(), iconSize: 20 }
  ];

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
    dataTabActions.clearJoinStats();
    dataTabStore.resetStepCompletion(2);
    dataTabActions.selectBasemap(basemap.file);
    basemapStyleStore.setReferenceBasemap(basemap.file);

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
      joinLoading = true;
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

        const hasBlockingErrors =
          stats.toVerifyCount > 0 ||
          stats.entities.filter((e) => e.status === JoinStatus.DUPLICATE)
            .length > 0;

        if (!hasBlockingErrors && stats.joinedCount > 0) {
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
      } finally {
        joinLoading = false;
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

    if (currentJoinAbortController) {
      currentJoinAbortController.abort();
    }
    currentJoinAbortController = new AbortController();
    const abortSignal = currentJoinAbortController.signal;

    importUploading = true;
    importError = null;
    dataTabActions.clearJoinStats();
    dataTabStore.resetStepCompletion(2);

    try {
      const file = importFiles[0];
      const { basemap: customBasemap, geometryTable } =
        await processBasemapImport(file);

      if (abortSignal.aborted) return;

      basemapCatalogService.addCustomBasemap(customBasemap);
      osmBasemapStore.clear();
      dataTabActions.selectBasemap(customBasemap.file);
      basemapService.registerCustomBasemap(customBasemap, geometryTable);
      basemapStyleStore.setReferenceBasemap(customBasemap.file);
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
        joinLoading = true;
        try {
          const stats = await duckDBOrchestrator.computeJoinStats(
            datasetIdForOrchestrator,
            customBasemap,
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

          const hasBlockingErrors =
            stats.toVerifyCount > 0 ||
            stats.entities.filter((e) => e.status === JoinStatus.DUPLICATE)
              .length > 0;

          if (!hasBlockingErrors && stats.joinedCount > 0) {
            logger.info(
              'Auto-finalizing join - no errors detected',
              LogCategory.MAP,
              { joinedCount: stats.joinedCount }
            );

            try {
              await duckDBOrchestrator.finalizeJoin(
                datasetIdForOrchestrator,
                customBasemap,
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
        } finally {
          joinLoading = false;
        }
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
      dataTabStore.markStepComplete(2);
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

        const hasBlockingErrors =
          stats.toVerifyCount > 0 || stats.duplicateCount > 0;

        if (hasBlockingErrors || stats.joinedCount === 0) {
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
        dataTabStore.markStepComplete(2);
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

    const hasBlockingErrors = toVerifyCount > 0 || duplicates.length > 0;
    if (hasBlockingErrors) {
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

      dataTabStore.markStepComplete(2);

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
              joinLoading = true;
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
              } finally {
                joinLoading = false;
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

    void initializeBasemapCatalog();
  });

  $effect(() => {
    void dataTabState.geolocation.linkedVariableName;
    if (selectedDataset) {
      void loadSuggestions();
    }
  });

  let previousDatasetId: string | null = null;
  $effect(() => {
    const currentDatasetId = selectedDataset?.id ?? null;

    if (previousDatasetId !== null && currentDatasetId !== previousDatasetId) {
      logger.info(
        'Clearing join state due to dataset change',
        LogCategory.MAP,
        {
          previousDatasetId,
          newDatasetId: currentDatasetId
        }
      );

      if (currentJoinAbortController) {
        currentJoinAbortController.abort();
        currentJoinAbortController = null;
      }

      osmBasemapStore.clear();
      dataTabActions.clearJoinStats();
      dataTabActions.selectBasemap('');
      basemapStyleStore.setReferenceBasemap(null);
      dataTabStore.resetStepCompletion(2);
      importedBasemap = null;
      importError = null;
    }

    previousDatasetId = currentDatasetId;
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
  {:else if activeTabIndex === 2}
    <BasemapOsmTab
      hasGPSCoordinates={hasGPSCoordinates()}
      onSelectOSM={handleSelectOSM}
      onGoToVisualize={handleGoToVisualize}
    />
  {/if}

  {#if basemapSelected}
    <hr class="join-separator" />
    <JoinAssistedSection
      joinRows={joinRows}
      duplicates={duplicates}
      unknowns={unknowns}
      joinedCount={joinedCount}
      toVerifyCount={toVerifyCount}
      linkedVariableName={dataTabState.geolocation.linkedVariableName}
      loading={joinLoading}
      joinFinalized={dataTabStore.hasCompletedStep[2]}
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
