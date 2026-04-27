<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import { InlineNotification } from 'carbon-components-svelte';
  import { DataEnrichment } from 'carbon-icons-svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import {
    EnrichmentBasemapSelector,
    EnrichmentFileUpload,
    EnrichmentJoinConfig,
    buildEnrichDataFieldItems,
    buildGeoFileColumns,
    findSuggestedColumn,
    hasOnlyCoordinates as checkHasOnlyCoordinates,
    useEnrichmentBasemap,
    useEnrichmentFile,
    useEnrichmentJoin
  } from './enrich-data';

  import { dataTabStore } from './data-tab.store.svelte';

  const selectedDataset = $derived(datasetsStore.selectedDataset);

  const joinTabularEnabled = $derived(
    dataTabState.enrichData.joinTabularEnabled
  );

  let enrichLinkedVariableId = $state<number | undefined>(undefined);
  let geoFileColumnId = $state<number | undefined>(undefined);
  let previousDatasetId: string | undefined = undefined;
  let previousEnrichmentDatasetId: string | undefined = undefined;

  const fileHook = useEnrichmentFile();
  const basemapHook = useEnrichmentBasemap();
  const overlayBasemapEnabled = $derived(
    dataTabState.enrichData.overlayBasemapEnabled
  );

  const enrichGeoDetection = $derived(fileHook.enrichmentDataset?.geoDetection);

  const enrichDataFieldItems = $derived(
    buildEnrichDataFieldItems(fileHook.enrichmentDataset, enrichGeoDetection)
  );

  const geoFileColumns = $derived(buildGeoFileColumns(selectedDataset));

  const enrichSuggestedColumn = $derived(
    findSuggestedColumn(enrichGeoDetection, enrichDataFieldItems)
  );

  const hasOnlyCoordinatesValue = $derived(
    checkHasOnlyCoordinates(enrichGeoDetection)
  );

  const joinHook = useEnrichmentJoin({
    getEnrichmentDataset: () => fileHook.enrichmentDataset,
    getEnrichLinkedVariableId: () => enrichLinkedVariableId,
    getGeoFileColumnId: () => geoFileColumnId,
    getEnrichDataFieldItems: () => enrichDataFieldItems,
    getGeoFileColumns: () => geoFileColumns,
    isJoinBlocked: () => hasOnlyCoordinatesValue,
    onJoinFinalized: () => {
      dataTabActions.setEnrichDataState({ joinTabularEnabled: false });
      fileHook.handleRemoveFile();
      enrichLinkedVariableId = undefined;
      geoFileColumnId = undefined;
    }
  });

  $effect(() => {
    const currentId = selectedDataset?.id;
    if (currentId !== previousDatasetId) {
      previousDatasetId = currentId;
      enrichLinkedVariableId = undefined;
      geoFileColumnId = undefined;
      dataTabActions.setEnrichDataState({
        joinTabularEnabled: false,
        overlayBasemapEnabled: false
      });
      fileHook.handleRemoveFile();
      joinHook.resetJoinState();
    }
  });

  $effect(() => {
    const currentEnrichmentId = fileHook.enrichmentDataset?.id;
    if (currentEnrichmentId !== previousEnrichmentDatasetId) {
      previousEnrichmentDatasetId = currentEnrichmentId;
      enrichLinkedVariableId = undefined;
      geoFileColumnId = undefined;
      joinHook.resetJoinState();
    }
  });

  $effect(() => {
    if (
      !hasOnlyCoordinatesValue &&
      enrichLinkedVariableId === undefined &&
      enrichSuggestedColumn
    ) {
      enrichLinkedVariableId = enrichSuggestedColumn.id;
    }
  });

  $effect(() => {
    if (hasOnlyCoordinatesValue) {
      enrichLinkedVariableId = undefined;
      joinHook.resetJoinState();
      return;
    }

    const hasEnrichCol = enrichLinkedVariableId !== undefined;
    const hasGeoCol = geoFileColumnId !== undefined;
    const hasDataset = fileHook.enrichmentDataset !== null;
    const hasGeoDataset = selectedDataset !== null;

    if (hasEnrichCol && hasGeoCol && hasDataset && hasGeoDataset) {
      joinHook.computeEnrichmentJoinStats();
    }
  });

  function handleRemoveFile() {
    fileHook.handleRemoveFile();
    enrichLinkedVariableId = undefined;
    geoFileColumnId = undefined;
    joinHook.resetJoinState();
  }

  function handleEnrichLinkedVariableChange(
    id: number | undefined,
    columnName?: string
  ) {
    enrichLinkedVariableId = id;
    if (columnName) {
      dataTabActions.setEnrichDataState({ enrichmentColumn: columnName });
    }
  }

  function handleGeoFileColumnChange(
    id: number | undefined,
    columnName?: string
  ) {
    geoFileColumnId = id;
    if (columnName) {
      dataTabActions.setEnrichDataState({ targetColumn: columnName });
    }
  }

  $effect(() => {
    if (selectedDataset && selectedDataset.geometry) {
      dataTabStore.markStepComplete(1);
    } else {
      dataTabStore.resetStepCompletion(1);
    }
  });

  const stepTitle = $derived.by(() => {
    const stepNumber = dataTabStore.getDisplayedStepNumber('enrich');
    const title = m.enrich_step_title();

    return stepNumber === null ? title : `${stepNumber}. ${title}`;
  });
</script>

<section id="enrich-data-step">
  <MainToolBarHeader title={stepTitle} icon={DataEnrichment} showDivider />

  <p class="kh-help">
    {m.enrich_step_description()}
    <InfoPopover text={m.enrich_step_info()} />
  </p>

  <div class="enrich-sections">
    <ExpandableSection
      title={m.enrich_join_tabular_title()}
      description={m.enrich_join_tabular_description()}
      showToggle={true}
      open={joinTabularEnabled}
      toggleChecked={joinTabularEnabled}
      onToggleChange={(checked) => {
        dataTabActions.setEnrichDataState({ joinTabularEnabled: checked });
      }}
    >
      <div class="section-content">
        {#if !fileHook.enrichmentDataset}
          <EnrichmentFileUpload
            isUploading={fileHook.isUploading}
            pastedDataValue={fileHook.pastedDataValue}
            onlineUrlValue={fileHook.onlineUrlValue}
            onFileUpload={fileHook.handleFileUpload}
            onPasteData={fileHook.handlePasteData}
            onLoadOnlineFile={fileHook.handleLoadOnlineFile}
            onPastedDataChange={fileHook.setPastedDataValue}
            onUrlChange={fileHook.setOnlineUrlValue}
          />
        {:else}
          <EnrichmentJoinConfig
            enrichmentDataset={fileHook.enrichmentDataset}
            enrichmentFile={fileHook.enrichmentFile}
            geoFileColumns={geoFileColumns}
            enrichDataFieldItems={enrichDataFieldItems}
            enrichLinkedVariableId={enrichLinkedVariableId}
            geoFileColumnId={geoFileColumnId}
            enrichSuggestedColumn={enrichSuggestedColumn}
            hasOnlyCoordinates={hasOnlyCoordinatesValue}
            joinStats={joinHook.joinStats}
            isComputingJoin={joinHook.isComputingJoin}
            isFinalizingJoin={joinHook.isFinalizingJoin}
            onRemoveFile={handleRemoveFile}
            onEnrichLinkedVariableChange={handleEnrichLinkedVariableChange}
            onGeoFileColumnChange={handleGeoFileColumnChange}
            onMappingChange={joinHook.handleMappingChange}
            onFinalizeJoin={joinHook.handleFinalizeEnrichment}
          />
        {/if}

        {#if fileHook.uploadError}
          <InlineNotification
            kind="error"
            title={m.error_title()}
            subtitle={fileHook.uploadError}
            hideCloseButton={false}
            on:close={() => fileHook.handleRemoveFile()}
            lowContrast
          />
        {/if}
      </div>
    </ExpandableSection>

    <ExpandableSection
      title={m.enrich_overlay_basemap_title()}
      description={m.enrich_overlay_basemap_description()}
      showToggle={true}
      open={overlayBasemapEnabled}
      toggleChecked={overlayBasemapEnabled}
      onToggleChange={(checked) => {
        dataTabActions.setEnrichDataState({ overlayBasemapEnabled: checked });
        if (!checked) {
          basemapHook.clearSelectedBasemap();
          return;
        }
        basemapHook.activatePreferredBasemap();
      }}
    >
      <EnrichmentBasemapSelector
        basemapTabIndex={basemapHook.basemapTabIndex}
        selectedBasemapId={basemapHook.selectedBasemapId}
        basemaps={basemapHook.basemaps}
        suggestedBasemaps={basemapHook.suggestedBasemaps}
        basemapImportUploading={basemapHook.basemapImportUploading}
        basemapImportError={basemapHook.basemapImportError}
        importedCustomBasemap={basemapHook.importedCustomBasemap}
        onTabChange={basemapHook.setBasemapTabIndex}
        onSelectBasemap={basemapHook.handleSelectBasemap}
        onBasemapImportFile={basemapHook.handleBasemapImportFile}
        onBasemapUrlLoad={basemapHook.handleBasemapUrlLoad}
        onClearError={basemapHook.clearBasemapImportError}
        onSelectOSM={basemapHook.handleSelectOSM}
      />
    </ExpandableSection>
  </div>
</section>

<style>
  #enrich-data-step {
    display: flex;
    flex-direction: column;
  }

  .kh-help {
    color: var(--cds-text-02);
    font-size: 0.8125rem;
    line-height: 1.25rem;
    margin-bottom: var(--cds-spacing-02);
  }

  .section-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }
</style>
