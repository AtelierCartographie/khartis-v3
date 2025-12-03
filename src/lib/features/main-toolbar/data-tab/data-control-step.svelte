<script lang="ts">
  import AdvancedDataTable from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import {
    DataTableSkeleton,
    InlineNotification
  } from 'carbon-components-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import CalculatorPanel from './components/calculator-panel.svelte';
  import DataToolPanel from './components/data-tool-panel.svelte';
  import DataToolsBar from './components/data-tools-bar.svelte';
  import FiltersPanel from './components/filters-panel.svelte';
  import SearchPanel from './components/search-panel.svelte';
  import { DataToolType } from './data-tab.types';
  import { dataToolsStore } from './data-tools.store.svelte';
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

  const currentDuckTable = $derived.by(() => {
    const _version = duckDBDatasetsVersion;
    const allDuckDatasets = duckDBOrchestrator.getAllDatasets();
    const tableName = selectedDataset?.sourceFileId
      ? allDuckDatasets.find(
          (d) => d.sourceFileId === selectedDataset.sourceFileId
        )?.tableName || null
      : null;
    return tableName;
  });

  let resetModalOpen = $state(false);
  let isEditingName = $state(false);
  let editedName = $state('');
  let typesNotificationDismissed = $state(false);
  let missingValuesNotificationDismissed = $state(false);

  function startEditing() {
    if (!selectedDataset) return;
    editedName = selectedDataset.name;
    isEditingName = true;
  }

  async function saveRename() {
    if (!selectedDataset || !editedName.trim()) {
      cancelEditing();
      return;
    }

    await datasetsStore.renameDataset(selectedDataset.id, editedName);
    isEditingName = false;
  }

  function cancelEditing() {
    isEditingName = false;
    editedName = '';
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      saveRename();
    } else if (event.key === 'Escape') {
      cancelEditing();
    }
  }

  function handleBlur() {
    if (editedName.trim()) {
      saveRename();
    } else {
      cancelEditing();
    }
  }

  function handleDoubleClick() {
    startEditing();
  }

  let nameInputRef = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (isEditingName && nameInputRef) {
      nameInputRef.focus();
      nameInputRef.select();
    }
  });

  // Use a separate key that only increments on explicit refresh calls
  // This avoids unnecessary remounts during initial batch load
  let forceRefreshKey = $state(0);

  function refreshTable() {
    // Increment the key to force a table remount
    forceRefreshKey++;
  }

  function handleOpenReset() {
    resetModalOpen = true;
  }

  let searchResults = $state<number[]>([]);
  let currentSearchIndex = $state(0);

  function handleSearchResults(results: number[], currentIndex: number) {
    searchResults = results;
    currentSearchIndex = currentIndex;
  }

  const isToolOpen = $derived(dataToolsStore.isOpen);
  const activeTool = $derived(dataToolsStore.activeTool);

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
      />
    {/if}

    <!-- Barre d'outils -->
    <DataToolsBar onReset={handleOpenReset} />
  {/if}

  {#if processedDataset}
    {#key forceRefreshKey}
      <AdvancedDataTable
        dataset={processedDataset}
        tableName={currentDuckTable || undefined}
        showSummaryPlots={true}
        highlightIds={searchResults}
      />
    {/key}
  {:else if selectedDataset || isProcessingFiles}
    <!-- Skeleton loader pendant le chargement -->
    <div class="table-skeleton-wrapper">
      <DataTableSkeleton {...skeletonProps} />
    </div>
  {:else}
    <div class="empty-state">
      <p class="empty-message">Aucune donnée chargée</p>
      <p class="empty-help">
        Les outils de contrôle (tableau, filtres, calculatrice) apparaîtront ici
        après l'import de vos données.
      </p>
    </div>
  {/if}

  {#if selectedDataset && !typesNotificationDismissed}
    <InlineNotification
      title="Types des variables"
      subtitle="Khartis a détecté le type de chaque variable. Il apporte ensuite des suggestions de visualisations plus pertinentes."
      kind="info"
      lowContrast
      hideCloseButton={false}
      on:close={() => (typesNotificationDismissed = true)}
    />
  {/if}

  {#if processedDataset && processedDataset.columns.some((col) => col.nullable) && !missingValuesNotificationDismissed}
    <InlineNotification
      title="Attention"
      subtitle="Plusieurs variables sont concernées par des avertissements indiqués dans l'en-tête du tableau."
      kind="warning"
      lowContrast
      hideCloseButton={false}
      on:close={() => (missingValuesNotificationDismissed = true)}
    />
  {/if}
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
    border-radius: 4px;
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

  /* Cache le header et la toolbar du DataTableSkeleton */
  .table-skeleton-wrapper :global(.bx--data-table-header),
  .table-skeleton-wrapper :global(.bx--table-toolbar) {
    display: none;
  }
</style>
