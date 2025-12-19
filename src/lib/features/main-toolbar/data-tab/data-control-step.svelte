<script lang="ts">
  import AdvancedDataTable from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import { FileType } from '$lib/features/commons/store/create-project.types';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import {
    showError,
    showSuccess
  } from '$lib/features/commons/utils/notification.utils.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import { Duck, duckDBOrchestrator } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import {
    DataTableSkeleton,
    InlineNotification
  } from 'carbon-components-svelte';
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
    const allDuckDatasets = duckDBOrchestrator.getAllDatasets();
    const tableName = selectedDataset?.sourceFileId
      ? allDuckDatasets.find(
          (d) => d.sourceFileId === selectedDataset.sourceFileId
        )?.tableName || null
      : null;
    return tableName;
  });

  let resetModalOpen = $state(false);
  let deleteModalOpen = $state(false);
  let warningsNotificationDismissed = $state(false);
  let isModalOpen = $state(false);
  let selectedRowIds = $state<number[]>([]);
  let csvOptionsModalOpen = $state(false);
  let showSummaryPlots = $state(true);
  let currentCsvOptions = $state<CsvOptions>({
    header: true,
    decimalSeparator: '.',
    thousandsSeparator: undefined
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
    if (!sourceFile || !currentDuckTable || !selectedDataset) {
      throw new Error('No source file or table available');
    }

    const file = sourceFile.originalFile;
    if (!file) {
      throw new Error('Original file not available for re-import');
    }

    try {
      await Duck.read_tabular(file, {
        tablename: currentDuckTable,
        header: options.header,
        decimal_separator: options.decimalSeparator,
        thousands_separator: options.thousandsSeparator
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
        }
      } else {
        totalReplaced = await duckDBOrchestrator.replaceInColumn(
          currentDuckTable,
          source,
          searchValue,
          replaceValue
        );
      }

      if (totalReplaced > 0) {
        datasetsStore.recordTransformation(
          selectedDataset.id,
          `Replaced "${searchValue}" with "${replaceValue}" (${totalReplaced} occurrences)`
        );

        if (source === 'all') {
          const textColumns =
            selectedDataset.columns?.filter((col) => {
              const type = String(col.type).toLowerCase();
              return type === 'text' || type === 'varchar' || type === 'string';
            }) ?? [];
          for (const col of textColumns) {
            await projectStore.addColumnTransformation(
              selectedDataset.sourceFileId,
              {
                type: 'replace',
                column: col.name,
                searchValue,
                newValue: replaceValue,
                timestamp: new Date().toISOString()
              }
            );
          }
        } else {
          await projectStore.addColumnTransformation(
            selectedDataset.sourceFileId,
            {
              type: 'replace',
              column: source,
              searchValue,
              newValue: replaceValue,
              timestamp: new Date().toISOString()
            }
          );
        }

        duckDBOrchestrator.bumpDatasetsVersion();
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

  const isToolOpen = $derived(dataToolsStore.isOpen);
  const activeTool = $derived(dataToolsStore.activeTool);

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
    if (selectedDataset && currentDuckTable) {
      dataTabStore.markStepComplete(0);
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skeletonProps = { columns: 5, rows: 12 } as any;
</script>

<section id="data-control-step">
  <MainToolBarHeader title={m.data_control_step_title()} />

  <!-- Panneaux flottants -->
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

    {#if isCsvFile}
      <CsvOptionsModal
        open={csvOptionsModalOpen}
        currentOptions={currentCsvOptions}
        onClose={() => (csvOptionsModalOpen = false)}
        onApply={handleApplyCsvOptions}
      />
    {/if}

    <!-- Barre d'outils -->
    <DataToolsBar
      onDelete={handleOpenDeleteModal}
      onReset={handleOpenReset}
      onExpand={() => (isModalOpen = true)}
      onCsvOptions={handleOpenCsvOptions}
      onToggleSummaryPlots={() => (showSummaryPlots = !showSummaryPlots)}
      selectionCount={selectedRowIds.length}
      showCsvOptions={isCsvFile && !!sourceFile?.originalFile}
      showSummaryPlots={showSummaryPlots}
    />
  {/if}

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
    <!-- Skeleton loader pendant le chargement ou batch processing -->
    <div class="table-skeleton-wrapper">
      <DataTableSkeleton {...skeletonProps} />
    </div>
  {:else}
    <div class="empty-state">
      <p class="empty-message">{m.data_control_empty_title()}</p>
      <p class="empty-help">
        {m.data_control_empty_help()}
      </p>
    </div>
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
    cellHighlights={searchHighlight.cellHighlights}
    currentCell={searchHighlight.currentCell}
    highlightedRowIds={searchHighlight.highlightedRowIds}
    onClose={() => (isModalOpen = false)}
  />
</section>

<style>
  #data-control-step {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
    min-height: 0;
  }

  .empty-state {
    padding: var(--cds-spacing-07) var(--cds-spacing-05);
    text-align: center;
    color: var(--cds-text-02);
    background-color: var(--cds-ui-01);
    border-radius: var(--cds-spacing-02);
    margin-top: var(--cds-spacing-05);
  }

  .empty-message {
    margin: 0 0 var(--cds-spacing-03) 0;
    font-size: 1rem;
    font-weight: 500;
    color: var(--cds-text-01);
  }

  .empty-help {
    margin: 0;
    font-size: 0.875rem;
    color: var(--cds-text-02);
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
