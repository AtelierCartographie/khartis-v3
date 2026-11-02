<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/stores/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    InlineNotification,
    NotificationActionButton
  } from 'carbon-components-svelte';
  import { ColumnType } from '$lib/features/data-pipeline';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import { DataEnrichment } from 'carbon-icons-svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { tick, untrack } from 'svelte';
  import MainToolBarHeader from '$lib/features/main-toolbar/components/main-toolbar-header.svelte';
  import EnrichmentBasemapSelector from './enrich-data/enrichment-basemap-selector.svelte';
  import EnrichmentFileUpload from './enrich-data/enrichment-file-upload.svelte';
  import EnrichmentJoinConfig from './enrich-data/enrichment-join-config.svelte';
  import {
    buildEnrichDataFieldItems,
    buildGeoFileColumns,
    findSuggestedColumn,
    hasOnlyCoordinates as checkHasOnlyCoordinates
  } from '../utils/enrichment.utils';
  import { useEnrichmentBasemap } from '../hooks/use-enrichment-basemap.svelte';
  import { useEnrichmentFile } from '../hooks/use-enrichment-file.svelte';
  import { useEnrichmentJoin } from '../hooks/use-enrichment-join.svelte';
  import {
    findBestColumnPair,
    findBestTargetColumn
  } from '../services/target-column-ranking.service';

  import { dataTabStore } from '../stores/data-tab.store.svelte';
  import { enrichmentRequestStore } from '../stores/enrichment-request.store.svelte';

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const projectTables = $derived(
    datasetsStore.datasets
      .filter(
        (dataset) =>
          !dataset.geometry &&
          dataset.id !== selectedDataset?.id &&
          Boolean(dataset.tableName)
      )
      .map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        rowCount: dataset.rowCount
      }))
  );

  const selectedSourceFile = $derived(
    projectStore.currentProject?.data?.sourceFiles?.find(
      (file) => file.id === selectedDataset?.sourceFileId
    )
  );
  const hasJoinedTable = $derived(
    Boolean(selectedSourceFile?.enrichmentSnapshot)
  );
  const joinedTableNames = $derived([
    ...new Set(Object.values(selectedSourceFile?.joinedColumnOrigins ?? {}))
  ]);
  // A joined table is undone through the file reset, not the toggle.
  const joinTabularEnabled = $derived(
    hasJoinedTable || dataTabState.enrichData.joinTabularEnabled
  );
  const joinTabularOpen = $derived(
    joinTabularEnabled && dataTabState.uiPanels.enrichJoinTabularOpen
  );

  let enrichLinkedVariableId = $state<number | undefined>(undefined);
  let geoFileColumnId = $state<number | undefined>(undefined);
  let previousDatasetId: string | undefined = undefined;
  let hasObservedDataset = false;
  let previousEnrichmentDatasetId: string | undefined = undefined;
  // A geo column picked by the user is kept; a suggested one follows the
  // tabular column.
  let isGeoFileColumnSuggested = false;
  let targetColumnSuggestionRun = 0;

  const fileHook = useEnrichmentFile();
  const basemapHook = useEnrichmentBasemap();
  const overlayBasemapEnabled = $derived(
    dataTabState.enrichData.overlayBasemapEnabled
  );
  const overlayBasemapOpen = $derived(
    overlayBasemapEnabled && dataTabState.uiPanels.enrichOverlayBasemapOpen
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
      dataTabStore.markStepComplete(1);
      dataTabActions.setEnrichDataState({ joinTabularEnabled: false });
      dataTabActions.setUiPanelsState({ enrichJoinTabularOpen: false });
      fileHook.handleRemoveFile();
      enrichLinkedVariableId = undefined;
      geoFileColumnId = undefined;
    }
  });

  $effect(() => {
    const currentId = selectedDataset?.id;
    if (!hasObservedDataset) {
      previousDatasetId = currentId;
      hasObservedDataset = currentId !== undefined;
      return;
    }

    if (currentId !== previousDatasetId) {
      previousDatasetId = currentId;
      enrichLinkedVariableId = undefined;
      geoFileColumnId = undefined;
      dataTabActions.setEnrichDataState({
        joinTabularEnabled: false,
        overlayBasemapEnabled: false,
        preferredOverlayBasemapId: undefined,
        preferredOverlayBasemapSource: undefined
      });
      dataTabActions.setUiPanelsState({
        enrichJoinTabularOpen: false,
        enrichOverlayBasemapOpen: false,
        enrichBasemapSuggestionsOpen: undefined,
        enrichBasemapCatalogOpen: undefined
      });
      fileHook.handleRemoveFile();
      basemapHook.clearSelectedBasemap();
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
    if (
      enrichLinkedVariableId === undefined &&
      dataTabState.enrichData.enrichmentColumn
    ) {
      const item = enrichDataFieldItems.find(
        (field) => field.columnName === dataTabState.enrichData.enrichmentColumn
      );
      if (item) {
        enrichLinkedVariableId = item.id;
      }
    }
  });

  $effect(() => {
    if (geoFileColumnId === undefined && dataTabState.enrichData.targetColumn) {
      const item = geoFileColumns.find(
        (field) => field.columnName === dataTabState.enrichData.targetColumn
      );
      if (item) {
        geoFileColumnId = item.id;
        isGeoFileColumnSuggested = false;
      }
    }
  });

  $effect(() => {
    const sourceTableName = fileHook.enrichmentDataset?.tableName;
    const targetTableName = selectedDataset?.tableName;
    const sourceColumn = enrichDataFieldItems.find(
      (field) => field.id === enrichLinkedVariableId
    )?.columnName;
    const candidates = geoFileColumns;
    if (
      hasOnlyCoordinatesValue ||
      !sourceTableName ||
      !targetTableName ||
      !sourceColumn ||
      candidates.length === 0
    ) {
      return;
    }
    if (
      untrack(() => geoFileColumnId) !== undefined &&
      !isGeoFileColumnSuggested
    ) {
      return;
    }

    const run = ++targetColumnSuggestionRun;
    void findBestTargetColumn({
      sourceTableName,
      sourceColumn,
      targetTableName,
      targetColumns: candidates.map((field) => field.columnName)
    })
      .then((best) => {
        const columnName = best?.column;
        if (run !== targetColumnSuggestionRun || !columnName) return;
        if (geoFileColumnId !== undefined && !isGeoFileColumnSuggested) return;
        const item = geoFileColumns.find(
          (field) => field.columnName === columnName
        );
        if (!item) return;
        geoFileColumnId = item.id;
        isGeoFileColumnSuggested = true;
      })
      .catch((error: unknown) => {
        logger.warn(
          'Failed to suggest the geo file join column',
          LogCategory.DATA,
          error
        );
      });
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
    isGeoFileColumnSuggested = false;
    if (columnName) {
      dataTabActions.setEnrichDataState({ targetColumn: columnName });
    }
  }

  // Enriching is optional: the step is done once a table was joined or a
  // basemap laid under the file, not merely because the file has geometry.
  const hasEnrichment = $derived(
    hasJoinedTable ||
      (overlayBasemapEnabled && Boolean(basemapHook.selectedBasemapId))
  );

  $effect(() => {
    if (hasEnrichment) {
      dataTabStore.markStepComplete(1);
    }
  });

  const PROJECT_TABLE_PROPOSAL_MIN_SHARE = 50;

  interface ProjectTableProposal {
    datasetId: string;
    name: string;
    sourceColumn: string;
    targetColumn: string;
    matchShare: number;
  }

  let tableProposal = $state<ProjectTableProposal | null>(null);
  let dismissedProposalKey = $state<string | null>(null);
  let tableProposalRun = 0;

  const tableProposalKey = $derived(
    tableProposal && selectedDataset
      ? `${selectedDataset.id}::${tableProposal.datasetId}`
      : null
  );

  // A project table holding most of the values of a geo column is offered as
  // the table to join, before the user opens the section, unless the file is
  // already enriched.
  $effect(() => {
    const geoTableName = selectedDataset?.tableName;
    const targetColumns = geoFileColumns.map((field) => field.columnName);
    const candidates = datasetsStore.datasets.filter((dataset) =>
      projectTables.some((table) => table.id === dataset.id)
    );
    const run = ++tableProposalRun;
    tableProposal = null;
    if (
      !geoTableName ||
      targetColumns.length === 0 ||
      candidates.length === 0 ||
      hasEnrichment ||
      untrack(() => fileHook.enrichmentDataset)
    ) {
      return;
    }

    void (async () => {
      let best: ProjectTableProposal | null = null;
      for (const dataset of candidates) {
        const pair = await findBestColumnPair({
          sourceTableName: dataset.tableName,
          sourceColumns: dataset.columns
            .filter((column) => column.type === ColumnType.TEXT)
            .map((column) => column.name),
          targetTableName: geoTableName,
          targetColumns
        });
        if (pair && (!best || pair.matchShare > best.matchShare)) {
          best = { datasetId: dataset.id, name: dataset.name, ...pair };
        }
      }
      if (run !== tableProposalRun) return;
      tableProposal =
        best && best.matchShare >= PROJECT_TABLE_PROPOSAL_MIN_SHARE
          ? best
          : null;
    })().catch((error: unknown) => {
      logger.warn(
        'Failed to look for a project table to join',
        LogCategory.DATA,
        error
      );
    });
  });

  /** Opens the join of a project table, with the column pair when known. */
  async function startProjectTableJoin(join: {
    datasetId: string;
    sourceColumn?: string;
    targetColumn?: string;
  }): Promise<void> {
    handleJoinTabularToggle(true);
    await fileHook.handleSelectProjectDataset(join.datasetId);
    // Selecting a table resets both columns: the matched pair is set after.
    await tick();
    const enrichItem = enrichDataFieldItems.find(
      (field) => field.columnName === join.sourceColumn
    );
    const geoItem = geoFileColumns.find(
      (field) => field.columnName === join.targetColumn
    );
    if (enrichItem) enrichLinkedVariableId = enrichItem.id;
    if (geoItem) {
      geoFileColumnId = geoItem.id;
      isGeoFileColumnSuggested = false;
    }
    dataTabActions.setEnrichDataState({
      enrichmentColumn: enrichItem?.columnName,
      targetColumn: geoItem?.columnName
    });
  }

  async function acceptTableProposal(): Promise<void> {
    const proposal = tableProposal;
    if (!proposal) return;
    dismissedProposalKey = tableProposalKey;
    await startProjectTableJoin(proposal);
  }

  // A join asked for from the tab of a table lands here, in the tab of the
  // geo file it enriches.
  $effect(() => {
    const geoDatasetId = selectedDataset?.id;
    if (!geoDatasetId || !enrichmentRequestStore.pending) return;
    const request = enrichmentRequestStore.take(geoDatasetId);
    if (!request) return;
    void untrack(() =>
      startProjectTableJoin({
        datasetId: request.tableDatasetId,
        sourceColumn: request.sourceColumn,
        targetColumn: request.targetColumn
      })
    );
  });

  function handleJoinTabularToggle(checked: boolean): void {
    dataTabActions.setEnrichDataState({ joinTabularEnabled: checked });
    dataTabActions.setUiPanelsState({ enrichJoinTabularOpen: checked });
  }

  function handleOverlayBasemapToggle(checked: boolean): void {
    dataTabActions.setEnrichDataState({ overlayBasemapEnabled: checked });
    dataTabActions.setUiPanelsState({ enrichOverlayBasemapOpen: checked });
    if (!checked) {
      basemapHook.clearSelectedBasemap();
      return;
    }
    basemapHook.activatePreferredBasemap();
  }

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

  {#if tableProposal && !fileHook.enrichmentDataset && tableProposalKey !== dismissedProposalKey}
    <InlineNotification
      kind="info"
      lowContrast
      title={m.enrich_table_proposal_title()}
      subtitle={m.enrich_table_proposal_subtitle({
        name: tableProposal.name,
        share: Math.round(tableProposal.matchShare),
        column: tableProposal.sourceColumn,
        target: tableProposal.targetColumn
      })}
      closeButtonDescription={m.a11y_close_notification()}
      on:close={() => (dismissedProposalKey = tableProposalKey)}
    >
      <NotificationActionButton
        slot="actions"
        on:click={() => void acceptTableProposal()}
      >
        {m.enrich_table_proposal_action()}
      </NotificationActionButton>
    </InlineNotification>
  {/if}

  <div class="enrich-sections">
    <ExpandableSection
      title={m.enrich_join_tabular_title()}
      description={m.enrich_join_tabular_description()}
      showToggle={true}
      open={joinTabularOpen}
      toggleChecked={joinTabularEnabled}
      toggleDisabled={hasJoinedTable}
      onToggle={(expanded) =>
        dataTabActions.setUiPanelsState({
          enrichJoinTabularOpen: expanded
        })}
      onToggleChange={handleJoinTabularToggle}
    >
      <div class="section-content">
        {#if hasJoinedTable && !fileHook.enrichmentDataset}
          <p class="kh-help">
            {joinedTableNames.length > 0
              ? m.enrich_join_tabular_joined({
                  names: joinedTableNames.join(', ')
                })
              : m.enrich_join_tabular_joined_unnamed()}
          </p>
        {/if}
        {#if !fileHook.enrichmentDataset}
          <EnrichmentFileUpload
            projectTables={projectTables}
            onSelectProjectTable={fileHook.handleSelectProjectDataset}
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
            enrichmentSourceName={fileHook.enrichmentSourceName}
            geoFileColumns={geoFileColumns}
            enrichDataFieldItems={enrichDataFieldItems}
            enrichLinkedVariableId={enrichLinkedVariableId}
            geoFileColumnId={geoFileColumnId}
            enrichSuggestedColumn={enrichSuggestedColumn}
            hasOnlyCoordinates={hasOnlyCoordinatesValue}
            view={joinHook.view}
            targetOptions={joinHook.targetOptions}
            fuzzyPassEstimate={joinHook.fuzzyPassEstimate}
            fuzzyPassRunning={joinHook.fuzzyPassRunning}
            joinedPage={joinHook.joinedPage}
            joinedPageRows={joinHook.joinedPageRows}
            joinedTargetValues={joinHook.joinedTargetValues}
            onRunFullFuzzyPass={joinHook.runFullFuzzyPass}
            onJoinedPageChange={joinHook.loadJoinedPage}
            onRequestJoinedEntities={joinHook.requestJoinedEntities}
            isComputingJoin={joinHook.isComputingJoin}
            isFinalizingJoin={joinHook.isFinalizingJoin}
            onRemoveFile={handleRemoveFile}
            onEnrichLinkedVariableChange={handleEnrichLinkedVariableChange}
            onGeoFileColumnChange={handleGeoFileColumnChange}
            onMappingChange={joinHook.handleMappingChange}
            onFinalizeJoin={joinHook.handleFinalizeEnrichment}
            onManualCorrection={joinHook.handleManualCorrection}
            onIgnoreEntities={joinHook.ignoreEntities}
            onValidateEntities={joinHook.validateEntities}
            onRestoreEntities={joinHook.restoreEntities}
          />
        {/if}

        {#if fileHook.uploadError}
          <InlineNotification
            closeButtonDescription={m.a11y_close_notification()}
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
      open={overlayBasemapOpen}
      toggleChecked={overlayBasemapEnabled}
      onToggle={(expanded) =>
        dataTabActions.setUiPanelsState({
          enrichOverlayBasemapOpen: expanded
        })}
      onToggleChange={handleOverlayBasemapToggle}
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
        suggestionsOpen={dataTabState.uiPanels.enrichBasemapSuggestionsOpen}
        catalogOpen={dataTabState.uiPanels.enrichBasemapCatalogOpen}
        rankedByExtent={Boolean(selectedDataset?.geometry)}
        onSuggestionsToggle={(expanded) =>
          dataTabActions.setUiPanelsState({
            enrichBasemapSuggestionsOpen: expanded
          })}
        onCatalogToggle={(expanded) =>
          dataTabActions.setUiPanelsState({
            enrichBasemapCatalogOpen: expanded
          })}
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
