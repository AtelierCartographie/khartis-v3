<script lang="ts">
  import AdvancedDataTable from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import { FileType } from '$lib/features/commons/store/create-project.types';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import {
    showError,
    showSuccess,
    showWarning
  } from '$lib/features/commons/utils/notification.utils.svelte';
  import { type DuckAnalyticsColumn } from '$lib/features/data-pipeline';
  import { enrichColumns } from '$lib/features/data-pipeline/operations/analysis';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import { Duck, duckDBOrchestrator } from '$lib/features/duckdb';
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
  import { resolveSelectedDuckTableName } from './services/dataset-resolution';

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

  let resetModalOpen = $state(false);
  let deleteModalOpen = $state(false);
  let deleteFilteredModalOpen = $state(false);
  let filteredRowsToDelete = $state(0);
  let warningsNotificationDismissed = $state(false);
  let isModalOpen = $state(false);
  let selectedRowIds = $state<number[]>([]);

  $effect(() => {
    void selectedDataset?.id;
    selectedRowIds = [];
  });

  let csvOptionsModalOpen = $state(false);
  let showSummaryPlots = $state(true);
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

  function handleOpenReset() {
    resetModalOpen = true;
  }

  function handleOpenCsvOptions() {
    csvOptionsModalOpen = true;
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

      const duckColumns = (await Duck.analyse(currentDuckTable, {
        force: true
      })) as DuckAnalyticsColumn[];
      const newColumns = enrichColumns(duckColumns);
      const newRowCount = await Duck.get_row_count(currentDuckTable);

      if (newRowCount === 0) {
        showWarning(m.csv_warning_empty_after_reimport(), '');
      }

      datasetsStore.updateDataset(selectedDataset.id, { columns: newColumns });
      datasetsStore.updateDatasetRowCount(selectedDataset.id, newRowCount);

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

      const newRowCount = Duck ? await Duck.get_row_count(currentDuckTable) : 0;

      datasetsStore.recordTransformation(
        selectedDataset.id,
        `Deleted ${count} rows (new total: ${newRowCount})`
      );
      datasetsStore.updateDatasetRowCount(selectedDataset.id, newRowCount);

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
      const count =
        await duckDBOrchestrator.deleteFilteredRows(currentDuckTable);

      if (count > 0) {
        const newRowCount = Duck
          ? await Duck.get_row_count(currentDuckTable)
          : 0;

        datasetsStore.recordTransformation(
          selectedDataset.id,
          `Deleted ${count} filtered rows (new total: ${newRowCount})`
        );
        datasetsStore.updateDatasetRowCount(selectedDataset.id, newRowCount);

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

  const isToolOpen = $derived(dataToolsStore.isOpen);
  const activeTool = $derived(dataToolsStore.activeTool);
  const MAP_HIGHLIGHT_DEBOUNCE_MS = 800;
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

  // Debounce map highlight updates to avoid expensive deck.gl layer rebuilds during search
  let mapHighlightTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const rowIds = searchHighlight.highlightedRowIds;
    clearTimeout(mapHighlightTimer);
    mapHighlightTimer = setTimeout(() => {
      if (rowIds.length > 0) {
        mapHighlightStore.setHighlightedRows(rowIds);
      } else {
        mapHighlightStore.clearHighlights();
      }
    }, MAP_HIGHLIGHT_DEBOUNCE_MS);
    return () => clearTimeout(mapHighlightTimer);
  });

  $effect(() => {
    if (selectedDataset && currentDuckTable) {
      dataTabStore.markStepComplete(0);
    }
  });

  const DATA_TABLE_SKELETON_COLUMNS = 5;
  const DATA_TABLE_SKELETON_ROWS = 5;
</script>

<section id="data-control-step">
  <MainToolBarHeader title={m.data_control_step_title()} icon={DataCheck} />

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
          onColumnCreated={refreshTable}
        />
      </DataToolPanel>
    {:else if activeTool === DataToolType.Filters}
      <DataToolPanel title={m.data_tool_filters()}>
        <FiltersPanel
          tableName={currentDuckTable || undefined}
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
        onSuccess={refreshTable}
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
      onToggleSummaryPlots={() => (showSummaryPlots = !showSummaryPlots)}
      selectionCount={selectedRowIds.length}
      resetDisabled={!hasDataModifications}
      showCsvOptions={isCsvFile &&
        !!(sourceFile?.originalFile || sourceFile?.content)}
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
          isExpanded={false}
          isSelectable={true}
          onSelectionChange={handleSelectionChange}
        />
      {/key}
    {:else if selectedDataset || isProcessingFiles || isBatchProcessing}
      <div class="table-skeleton-wrapper">
        <DataTableSkeleton
          key={DATA_TABLE_SKELETON_HEADER_KEY}
          empty
          columns={DATA_TABLE_SKELETON_COLUMNS}
          rows={DATA_TABLE_SKELETON_ROWS}
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
    cellHighlights={searchHighlight.cellHighlights}
    currentCell={searchHighlight.currentCell}
    highlightedRowIds={searchHighlight.highlightedRowIds}
    isSelectable={true}
    onSelectionChange={handleSelectionChange}
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
