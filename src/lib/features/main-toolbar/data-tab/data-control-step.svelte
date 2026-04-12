<script lang="ts">
  import AdvancedDataTable from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import type { TableMutation } from '$lib/features/commons/components/advanced-data-table/types';
  import { FileType } from '$lib/features/commons/store/create-project.types';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    dataTabActions,
    dataTabState
  } from '$lib/features/commons/store/data-tab.store.svelte';
  import type {
    EnrichDataState,
    GeolocationState
  } from '$lib/features/commons/store/data-tab.types';
  import {
    showError,
    showSuccess,
    showWarning
  } from '$lib/features/commons/utils/notification.utils.svelte';
  import { normalizeFormattedNumericColumns } from '$lib/features/data-pipeline/operations/tabular-numeric-normalization';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import { Duck } from '$lib/features/duckdb';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DataTableSkeleton,
    InlineNotification,
    Modal
  } from 'carbon-components-svelte';
  import { mapHighlightStore } from '$lib/features/map/stores/map-highlight.store.svelte';
  import { DataCheck } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import CalculatorPanel from './components/calculator-panel.svelte';
  import CsvOptionsModal, {
    type CsvOptions
  } from './components/csv-options-modal.svelte';
  import DataToolPanel from './components/data-tool-panel.svelte';
  import DataToolsBar from './components/data-tools-bar.svelte';
  import ExpandedTableModal from './components/expanded-table-modal.svelte';
  import FiltersPanel from './components/filters-panel.svelte';
  import SearchPanel, {
    type SearchHighlightResult
  } from './components/search-panel.svelte';
  import { dataTabStore } from './data-tab.store.svelte';
  import { dataToolsStore, DataToolType } from './data-tools.store.svelte';
  import DeleteRowsModal from './delete-rows-modal.svelte';
  import ResetDataModal from './reset-data-modal.svelte';
  import { refreshDatasetMetadata } from './services/dataset-metadata';
  import { resolveSelectedDuckTableName } from './services/dataset-resolution';
  import { UI_CONSTANTS } from '../constants';

  const selectedDataset = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    return dataset;
  });
  const processedDataset = $derived.by(() =>
    selectedDataset ? normalizeToProcessedDataset(selectedDataset) : null
  );
  const isProcessingFiles = $derived(datasetsStore.isProcessing);

  const duckDBDatasetsVersion = $derived(duckDBOrchestrator.datasetsVersion);
  const isBatchProcessing = $derived(duckDBOrchestrator.isBatchProcessing);

  const currentDuckTable = $derived.by(() => {
    void duckDBDatasetsVersion;
    return resolveSelectedDuckTableName(
      selectedDataset,
      duckDBOrchestrator.getAllDatasets()
    );
  });

  const hasDataModifications = $derived(
    selectedDataset?.id
      ? datasetsStore.hasModifications(selectedDataset.id)
      : false
  );
  const hiddenColumnsCount = $derived.by(() => {
    if (!selectedDataset?.id) return 0;
    return datasetsStore.getHiddenColumns(selectedDataset.id).length;
  });
  const showSummaryPlots = $derived(dataTabState.dataControl.showSummaryPlots);
  const tableSortColumn = $derived(dataTabState.dataControl.sortColumn);
  const tableSortOrder = $derived(dataTabState.dataControl.sortOrder);

  let resetModalOpen = $state(false);
  let deleteModalOpen = $state(false);
  let deleteFilteredModalOpen = $state(false);
  let filteredRowsToDelete = $state(0);
  let warningsNotificationDismissed = $state(false);
  let variableTypesNotificationDismissed = $state(false);
  let isModalOpen = $state(false);
  let selectedRowIds = $state<number[]>([]);

  $effect(() => {
    void selectedDataset?.id;
    selectedRowIds = [];
    dataTabActions.selectRows([]);
    warningsNotificationDismissed = false;
    variableTypesNotificationDismissed = false;
  });

  let csvOptionsModalOpen = $state(false);
  let currentCsvOptions = $state<CsvOptions>({
    header: true,
    decimalSeparator: '.',
    thousandsSeparator: undefined,
    delimiter: undefined
  });

  let confirmReimportOpen = $state(false);
  let pendingCsvOptions = $state<CsvOptions | null>(null);

  $effect(() => {
    const csvOpts = selectedDataset?.metadata?.csvOptions;
    if (csvOpts) {
      currentCsvOptions = {
        header: csvOpts.header,
        decimalSeparator: csvOpts.decimalSeparator,
        thousandsSeparator: csvOpts.thousandsSeparator,
        delimiter: csvOpts.delimiter
      };
    }
  });

  const isCsvFile = $derived.by(() => {
    if (!selectedDataset) return false;
    const format = selectedDataset.format?.toLowerCase();
    if (format === 'csv') return true;
    const sf = projectStore.currentProject?.data?.sourceFiles?.find(
      (f: { id: string }) => f.id === selectedDataset.sourceFileId
    );
    return sf?.fileType === FileType.CSV;
  });

  const sourceFile = $derived.by(() => {
    if (!selectedDataset) return null;
    return (
      projectStore.currentProject?.data?.sourceFiles?.find(
        (f: { id: string }) => f.id === selectedDataset.sourceFileId
      ) || null
    );
  });

  const hasNullableColumns = $derived(
    processedDataset
      ? processedDataset.columns.some((col) => col.nullable === true)
      : false
  );

  let forceRefreshKey = $state(0);

  function refreshTable() {
    forceRefreshKey++;
  }

  async function syncDatasetMetadataFromDuck(
    options: { force?: boolean } = {}
  ) {
    if (!selectedDataset?.id || !currentDuckTable) {
      return null;
    }

    try {
      return await refreshDatasetMetadata(
        selectedDataset.id,
        currentDuckTable,
        {
          force: options.force
        }
      );
    } catch {
      return null;
    }
  }

  async function handleCalculatedColumnCreated() {
    refreshTable();
    await syncDatasetMetadataFromDuck({ force: true });
  }

  function handleOpenReset() {
    resetModalOpen = true;
  }

  function handleOpenCsvOptions() {
    csvOptionsModalOpen = true;
  }

  function handleShowHiddenColumns() {
    if (!selectedDataset?.id) return;
    const hiddenColumns = datasetsStore.getHiddenColumns(selectedDataset.id);
    if (!hiddenColumns.length) return;
    for (const columnName of hiddenColumns) {
      datasetsStore.showColumn(selectedDataset.id, columnName);
    }
    refreshTable();
  }

  function clearSortForColumn(columnName: string) {
    if (dataTabState.dataControl.sortColumn !== columnName) {
      return;
    }

    dataTabActions.setDataControlState({
      sortColumn: null,
      sortOrder: null
    });
  }

  function renameReferencedColumns(previousName: string, nextName: string) {
    if (dataTabState.dataControl.sortColumn === previousName) {
      dataTabActions.setDataControlState({
        sortColumn: nextName
      });
    }

    const geolocationUpdates: Partial<GeolocationState> = {};
    if (dataTabState.geolocation.linkedVariableName === previousName) {
      geolocationUpdates.linkedVariableName = nextName;
    }
    if (dataTabState.geolocation.latitudeColumn === previousName) {
      geolocationUpdates.latitudeColumn = nextName;
    }
    if (dataTabState.geolocation.longitudeColumn === previousName) {
      geolocationUpdates.longitudeColumn = nextName;
    }
    if (Object.keys(geolocationUpdates).length > 0) {
      dataTabActions.setGeolocationState(geolocationUpdates);
    }

    const enrichUpdates: Partial<EnrichDataState> = {};
    if (dataTabState.enrichData.targetColumn === previousName) {
      enrichUpdates.targetColumn = nextName;
    }
    if (dataTabState.enrichData.enrichmentColumn === previousName) {
      enrichUpdates.enrichmentColumn = nextName;
    }
    if (Object.keys(enrichUpdates).length > 0) {
      dataTabActions.setEnrichDataState(enrichUpdates);
    }
  }

  function clearDeletedColumnReferences(columnName: string) {
    clearSortForColumn(columnName);

    const geolocationUpdates: Partial<GeolocationState> = {};
    let geolocationChanged = false;

    if (dataTabState.geolocation.linkedVariableName === columnName) {
      geolocationUpdates.linkedVariable = null;
      geolocationUpdates.linkedVariableName = '';
      geolocationChanged = true;
    }

    if (dataTabState.geolocation.latitudeColumn === columnName) {
      geolocationUpdates.latitudeColumn = undefined;
      geolocationChanged = true;
    }

    if (dataTabState.geolocation.longitudeColumn === columnName) {
      geolocationUpdates.longitudeColumn = undefined;
      geolocationChanged = true;
    }

    if (geolocationChanged) {
      dataTabActions.setGeolocationState(geolocationUpdates);
      dataTabActions.clearJoinStats();
      dataTabStore.resetStepCompletion(1);
      dataTabStore.resetStepCompletion(2);
    }

    const enrichUpdates: Partial<EnrichDataState> = {};
    let enrichChanged = false;

    if (dataTabState.enrichData.targetColumn === columnName) {
      enrichUpdates.targetColumn = undefined;
      enrichChanged = true;
    }

    if (dataTabState.enrichData.enrichmentColumn === columnName) {
      enrichUpdates.enrichmentColumn = undefined;
      enrichChanged = true;
    }

    if (enrichChanged) {
      dataTabActions.setEnrichDataState(enrichUpdates);
    }
  }

  async function handleTableMutation(mutation: TableMutation) {
    if (!selectedDataset?.id) {
      return;
    }

    switch (mutation.type) {
      case 'rename':
        renameReferencedColumns(mutation.oldName, mutation.newName);
        visualizationStore.renameDatasetColumnReferences(
          selectedDataset.id,
          mutation.oldName,
          mutation.newName
        );
        break;
      case 'delete':
        clearDeletedColumnReferences(mutation.columnName);
        visualizationStore.removeDatasetColumnReferences(
          selectedDataset.id,
          mutation.columnName
        );
        break;
      default:
        break;
    }

    await syncDatasetMetadataFromDuck({ force: true });
  }

  async function handleApplyCsvOptions(options: CsvOptions): Promise<void> {
    const hasTransformations =
      selectedDataset?.metadata?.transformations?.length ?? 0;
    if (hasTransformations > 0) {
      pendingCsvOptions = options;
      confirmReimportOpen = true;
      return;
    }
    await executeReimport(options);
  }

  async function executeReimport(options: CsvOptions): Promise<void> {
    if (!sourceFile || !currentDuckTable || !selectedDataset) {
      throw new Error(m.csv_error_no_source());
    }

    let file = sourceFile.originalFile;

    if (!file && sourceFile.content) {
      const content =
        typeof sourceFile.content === 'string'
          ? sourceFile.content
          : new TextDecoder().decode(sourceFile.content as ArrayBuffer);
      file = new File([content], sourceFile.name, {
        type: sourceFile.type || 'text/csv'
      });
    }

    if (!file) {
      throw new Error(m.csv_error_file_not_available());
    }

    try {
      await Duck.read_tabular(file, {
        tablename: currentDuckTable,
        header: options.header,
        decimal_separator: options.decimalSeparator,
        thousands_separator: options.thousandsSeparator,
        delimiter: options.delimiter
      });

      await normalizeFormattedNumericColumns(currentDuckTable, Duck);

      const snapshot = await syncDatasetMetadataFromDuck({ force: true });
      const newRowCount = snapshot?.rowCount ?? 0;

      if (newRowCount === 0) {
        showWarning(m.csv_warning_empty_after_reimport(), '');
      }

      datasetsStore.updateDatasetCsvOptions(selectedDataset.id, {
        header: options.header,
        decimalSeparator: options.decimalSeparator,
        thousandsSeparator: options.thousandsSeparator,
        delimiter: options.delimiter
      });

      currentCsvOptions = options;
      duckDBOrchestrator.bumpDatasetsVersion();
      refreshTable();

      showSuccess(m.csv_options_reimport_success(), '');
    } catch (error) {
      showError(
        m.csv_options_reimport_error(),
        error instanceof Error ? error.message : ''
      );
      throw error;
    }
  }

  async function handleConfirmReimport() {
    confirmReimportOpen = false;
    if (pendingCsvOptions) {
      const options = pendingCsvOptions;
      pendingCsvOptions = null;
      await executeReimport(options);
    }
  }

  let searchHighlight = $state<SearchHighlightResult>({
    cellHighlights: [],
    currentCell: null,
    highlightedRowIds: []
  });

  function handleSearchResults(result: SearchHighlightResult) {
    searchHighlight = result;
  }

  async function handleReplace(
    searchValue: string,
    replaceValue: string,
    source: string
  ) {
    if (!currentDuckTable || !selectedDataset) return;

    try {
      let totalReplaced = 0;
      const replacedColumns: string[] = [];

      if (source === 'all') {
        const textColumns =
          selectedDataset.columns?.filter((col) => {
            const type = String(col.type).toLowerCase();
            return type === 'text' || type === 'varchar' || type === 'string';
          }) ?? [];

        for (const col of textColumns) {
          const count = await duckDBOrchestrator.replaceInColumn(
            currentDuckTable,
            col.name,
            searchValue,
            replaceValue
          );
          totalReplaced += count;
          if (count > 0) {
            replacedColumns.push(col.name);
          }
        }
      } else {
        totalReplaced = await duckDBOrchestrator.replaceInColumn(
          currentDuckTable,
          source,
          searchValue,
          replaceValue
        );
        if (totalReplaced > 0) {
          replacedColumns.push(source);
        }
      }

      if (totalReplaced > 0) {
        datasetsStore.recordTransformation(
          selectedDataset.id,
          `Replaced "${searchValue}" with "${replaceValue}" (${totalReplaced} occurrences)`
        );

        const timestamp = new Date().toISOString();
        for (const column of replacedColumns) {
          await projectStore.addColumnTransformation(
            selectedDataset.sourceFileId,
            {
              type: 'replace',
              column,
              searchValue,
              newValue: replaceValue,
              timestamp
            }
          );
        }
      } else {
        showError(m.replace_no_match_title(), m.replace_no_match_message());
      }
    } catch (error) {
      showError(
        m.replace_error_title(),
        error instanceof Error ? error.message : m.replace_error_message()
      );
    }
  }

  function handleSelectionChange(ids: number[], _count: number) {
    selectedRowIds = ids;
    dataTabActions.selectRows(ids);
  }

  function handleSortChange(
    column: string | null,
    order: 'ASC' | 'DESC' | null
  ) {
    dataTabActions.setDataControlState({
      sortColumn: column,
      sortOrder: order
    });
  }

  function handleOpenDeleteModal() {
    if (selectedRowIds.length > 0) {
      deleteModalOpen = true;
    }
  }

  async function handleDeleteRows() {
    if (!currentDuckTable || selectedRowIds.length === 0 || !selectedDataset)
      return;

    const count = selectedRowIds.length;
    const rowIdsToDelete = [...selectedRowIds];

    try {
      await duckDBOrchestrator.dropRows(currentDuckTable, rowIdsToDelete);

      const snapshot = await syncDatasetMetadataFromDuck({ force: true });
      const newRowCount =
        snapshot?.rowCount ??
        (Duck ? await Duck.get_row_count(currentDuckTable) : 0);

      datasetsStore.recordTransformation(
        selectedDataset.id,
        `Deleted ${count} rows (new total: ${newRowCount})`
      );

      await projectStore.addDeletedRows(
        selectedDataset.sourceFileId,
        rowIdsToDelete
      );

      selectedRowIds = [];
      refreshTable();
      showSuccess(
        m.rows_deleted_success_title(),
        m.rows_deleted_success_message({ count })
      );
    } catch (error) {
      showError(
        m.rows_deleted_error_title(),
        error instanceof Error ? error.message : m.rows_deleted_error_message()
      );
    }
  }

  function handleOpenDeleteFilteredModal(count: number) {
    filteredRowsToDelete = count;
    deleteFilteredModalOpen = true;
  }

  async function handleDeleteFilteredRows() {
    if (!currentDuckTable || !selectedDataset) return;

    try {
      const { count, rowIds } =
        await duckDBOrchestrator.deleteFilteredRows(currentDuckTable);

      if (count > 0) {
        const snapshot = await syncDatasetMetadataFromDuck({ force: true });
        const newRowCount =
          snapshot?.rowCount ??
          (Duck ? await Duck.get_row_count(currentDuckTable) : 0);

        datasetsStore.recordTransformation(
          selectedDataset.id,
          `Deleted ${count} filtered rows (new total: ${newRowCount})`
        );
        await projectStore.addDeletedRows(selectedDataset.sourceFileId, rowIds);

        refreshTable();
        showSuccess(
          m.rows_deleted_success_title(),
          m.rows_deleted_success_message({ count })
        );
      }
    } catch (error) {
      showError(
        m.rows_deleted_error_title(),
        error instanceof Error ? error.message : m.rows_deleted_error_message()
      );
    }
  }

  async function handleResetSuccess() {
    refreshTable();
    await syncDatasetMetadataFromDuck({ force: true });
  }

  const isToolOpen = $derived(dataToolsStore.isOpen);
  const activeTool = $derived(dataToolsStore.activeTool);
  const DATA_TABLE_SKELETON_HEADER_KEY = 'skeleton';

  $effect(() => {
    if (activeTool !== DataToolType.Search) {
      searchHighlight = {
        cellHighlights: [],
        currentCell: null,
        highlightedRowIds: []
      };
    }
  });

  $effect(() => {
    const currentRowId = searchHighlight.currentCell?.rowId ?? null;

    if (currentRowId === null) {
      mapHighlightStore.clearHighlights();
      return;
    }

    mapHighlightStore.setHighlightedRows([currentRowId]);
  });

  $effect(() => {
    if (selectedDataset && currentDuckTable) {
      dataTabStore.markStepComplete(0);
    }
  });

  const stepTitle = $derived.by(() => {
    const stepNumber = dataTabStore.getDisplayedStepNumber('control');
    const title = m.data_control_step_title();

    return stepNumber === null ? title : `${stepNumber}. ${title}`;
  });
</script>

<section id="data-control-step">
  <MainToolBarHeader title={stepTitle} icon={DataCheck} />

  {#if isToolOpen}
    {#if activeTool === DataToolType.Search}
      <DataToolPanel title={m.data_tool_search()}>
        <SearchPanel
          tableName={currentDuckTable || undefined}
          onSearchResults={handleSearchResults}
          onReplace={handleReplace}
        />
      </DataToolPanel>
    {:else if activeTool === DataToolType.Calculator}
      <DataToolPanel title={m.data_tool_calculator()}>
        <CalculatorPanel
          tableName={currentDuckTable || undefined}
          onColumnCreated={handleCalculatedColumnCreated}
        />
      </DataToolPanel>
    {:else if activeTool === DataToolType.Filters}
      <DataToolPanel title={m.data_tool_filters()}>
        <FiltersPanel
          tableName={currentDuckTable || undefined}
          datasetVersion={duckDBDatasetsVersion}
          onFilterChange={refreshTable}
          onDeleteFilteredRows={handleOpenDeleteFilteredModal}
        />
      </DataToolPanel>
    {/if}
  {/if}

  {#if selectedDataset}
    {#if selectedDataset.id}
      <ResetDataModal
        bind:open={resetModalOpen}
        datasetId={selectedDataset.id}
        onSuccess={handleResetSuccess}
      />
    {/if}

    <DeleteRowsModal
      bind:open={deleteModalOpen}
      rowCount={selectedRowIds.length}
      onConfirm={handleDeleteRows}
    />

    <DeleteRowsModal
      bind:open={deleteFilteredModalOpen}
      rowCount={filteredRowsToDelete}
      onConfirm={handleDeleteFilteredRows}
    />

    {#if isCsvFile}
      <CsvOptionsModal
        open={csvOptionsModalOpen}
        currentOptions={currentCsvOptions}
        onClose={() => (csvOptionsModalOpen = false)}
        onApply={handleApplyCsvOptions}
      />

      <Modal
        bind:open={confirmReimportOpen}
        modalHeading={m.csv_confirm_reimport_title()}
        primaryButtonText={m.csv_options_apply()}
        secondaryButtonText={m.csv_options_cancel()}
        on:click:button--secondary={() => {
          confirmReimportOpen = false;
          pendingCsvOptions = null;
        }}
        on:click:button--primary={handleConfirmReimport}
        on:close={() => {
          confirmReimportOpen = false;
          pendingCsvOptions = null;
        }}
        size="sm"
        danger
      >
        <p>{m.csv_confirm_reimport_description()}</p>
      </Modal>
    {/if}

    <DataToolsBar
      onDelete={handleOpenDeleteModal}
      onReset={handleOpenReset}
      onExpand={() => (isModalOpen = true)}
      onCsvOptions={handleOpenCsvOptions}
      onToggleSummaryPlots={() =>
        dataTabActions.setDataControlState({
          showSummaryPlots: !showSummaryPlots
        })}
      onShowHiddenColumns={handleShowHiddenColumns}
      selectionCount={selectedRowIds.length}
      resetDisabled={!hasDataModifications}
      showCsvOptions={isCsvFile &&
        !!(sourceFile?.originalFile || sourceFile?.content)}
      showHiddenColumns={hiddenColumnsCount > 0}
      showSummaryPlots={showSummaryPlots}
    />
  {/if}

  <div class="content-area">
    {#if processedDataset && !isBatchProcessing}
      {#key forceRefreshKey}
        <AdvancedDataTable
          dataset={processedDataset}
          tableName={currentDuckTable || undefined}
          datasetVersion={duckDBDatasetsVersion}
          showSummaryPlots={showSummaryPlots}
          cellHighlights={searchHighlight.cellHighlights}
          currentCell={searchHighlight.currentCell}
          highlightedRowIds={searchHighlight.highlightedRowIds}
          activeJoinColumn={dataTabState.geolocation.linkedVariableName ||
            undefined}
          isExpanded={false}
          isSelectable={true}
          initialSortColumn={tableSortColumn}
          initialSortOrder={tableSortOrder}
          onTableMutation={handleTableMutation}
          onSelectionChange={handleSelectionChange}
          onSortChange={handleSortChange}
        />
      {/key}
    {:else if selectedDataset || isProcessingFiles || isBatchProcessing}
      <div class="table-skeleton-wrapper">
        <DataTableSkeleton
          key={DATA_TABLE_SKELETON_HEADER_KEY}
          empty
          columns={UI_CONSTANTS.DATA_TABLE_SKELETON_COLUMNS}
          rows={UI_CONSTANTS.DATA_TABLE_SKELETON_ROWS}
        />
      </div>
    {:else}
      <div class="empty-state">
        <p class="empty-message">{m.data_control_empty_title()}</p>
        <p class="empty-help">
          {m.data_control_empty_help()}
        </p>
      </div>
    {/if}
  </div>

  {#if processedDataset && !variableTypesNotificationDismissed}
    <InlineNotification
      title={m.data_control_variable_types_title()}
      subtitle={m.data_control_variable_types_subtitle()}
      kind="info"
      lowContrast
      hideCloseButton={false}
      on:close={() => (variableTypesNotificationDismissed = true)}
    />
  {/if}

  {#if hasNullableColumns && !warningsNotificationDismissed}
    <InlineNotification
      title={m.data_control_nullable_title()}
      subtitle={m.data_control_nullable_subtitle()}
      kind="warning"
      lowContrast
      hideCloseButton={false}
      on:close={() => (warningsNotificationDismissed = true)}
    />
  {/if}

  <ExpandedTableModal
    bind:open={isModalOpen}
    dataset={processedDataset || undefined}
    tableName={currentDuckTable || undefined}
    datasetVersion={duckDBDatasetsVersion}
    showSummaryPlots={showSummaryPlots}
    initialSortColumn={tableSortColumn}
    initialSortOrder={tableSortOrder}
    cellHighlights={searchHighlight.cellHighlights}
    currentCell={searchHighlight.currentCell}
    highlightedRowIds={searchHighlight.highlightedRowIds}
    isSelectable={true}
    onTableMutation={handleTableMutation}
    onSelectionChange={handleSelectionChange}
    onSortChange={handleSortChange}
    onClose={() => (isModalOpen = false)}
  />
</section>

<style>
  #data-control-step {
    display: flex;
    flex-direction: column;
    position: relative;
    min-height: 0;
  }

  .content-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
  }

  .empty-state {
    padding: 16px;
    text-align: center;
    color: #6f6f6f;
  }

  .empty-message {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 500;
    color: #161616;
  }

  .empty-help {
    margin: 0;
    font-size: 14px;
    color: #6f6f6f;
  }

  .table-skeleton-wrapper {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .table-skeleton-wrapper :global(.bx--data-table-header),
  .table-skeleton-wrapper :global(.bx--table-toolbar) {
    display: none;
  }
</style>
