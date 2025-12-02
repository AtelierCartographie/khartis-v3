<script lang="ts">
  import AdvancedDataTable from '$lib/features/commons/components/advanced-data-table/advanced-data-table.svelte';
  import { dataTabState } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    InlineNotification,
    TextInput
  } from 'carbon-components-svelte';
  import { Checkmark, Close, Edit, Reset } from 'carbon-icons-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import ResetDataModal from './reset-data-modal.svelte';

  const selectedDataset = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    return dataset;
  });
  const processedDataset = $derived.by(() =>
    selectedDataset ? normalizeToProcessedDataset(selectedDataset) : null
  );

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

  function startEditing() {
    if (!selectedDataset) return;
    editedName = selectedDataset.name;
    isEditingName = true;
  }

  function saveRename() {
    if (!selectedDataset || !editedName.trim()) {
      cancelEditing();
      return;
    }

    datasetsStore.renameDataset(selectedDataset.id, editedName);
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
</script>

<section id="data-control-step">
  <MainToolBarHeader title={m.data_control_step_title()} />

  {#if selectedDataset}
    <div class="dataset-info">
      <div class="dataset-meta">
        {#if isEditingName}
          <div class="dataset-name-edit">
            <TextInput
              size="sm"
              bind:value={editedName}
              on:keydown={handleKeyPress}
              placeholder="Nom du jeu de données"
            />
            <Button
              kind="ghost"
              size="small"
              icon={Checkmark}
              iconDescription="Valider"
              tooltipPosition="bottom"
              on:click={saveRename}
            />
            <Button
              kind="ghost"
              size="small"
              icon={Close}
              iconDescription="Annuler"
              tooltipPosition="bottom"
              on:click={cancelEditing}
            />
          </div>
        {:else}
          <div class="dataset-name-display">
            <span class="dataset-name">{selectedDataset.name}</span>
            <Button
              kind="ghost"
              size="small"
              icon={Edit}
              iconDescription="Renommer"
              tooltipPosition="bottom"
              on:click={startEditing}
            />
          </div>
        {/if}
        <span class="row-count">{selectedDataset.rowCount} lignes</span>
        {#if currentDuckTable}
          <span class="duck-badge">DuckDB ✓</span>
        {/if}
      </div>
      <Button
        kind="danger-tertiary"
        size="small"
        icon={Reset}
        tooltipPosition="left"
        iconDescription="Réinitialiser les données"
        on:click={() => (resetModalOpen = true)}
      >
        Réinitialiser
      </Button>
    </div>

    {#if selectedDataset.id}
      <ResetDataModal
        bind:open={resetModalOpen}
        datasetId={selectedDataset.id}
      />
    {/if}
  {/if}

  {#if processedDataset}
    <AdvancedDataTable
      dataset={processedDataset}
      tableName={currentDuckTable || undefined}
      showSummaryPlots={true}
      bind:searchQuery={dataTabState.dataControl.searchQuery}
    />
  {:else}
    <div class="empty-state">
      <p class="empty-message">Aucune donnée chargée</p>
      <p class="empty-help">
        Les outils de contrôle (tableau, filtres, calculatrice) apparaîtront ici
        après l'import de vos données.
      </p>
    </div>
  {/if}

  {#if selectedDataset}
    <InlineNotification
      title="Types des variables"
      subtitle="Khartis a détecté le type de chaque variable. Il apporte ensuite des suggestions de visualisations plus pertinentes."
      kind="info"
      lowContrast
      hideCloseButton={false}
    />

    {#if processedDataset && processedDataset.columns.some((col) => col.nullable)}
      <InlineNotification
        title="Valeurs manquantes"
        subtitle="Certaines colonnes contiennent des valeurs manquantes qui pourraient affecter les visualisations."
        kind="warning"
        lowContrast
        hideCloseButton={false}
      />
    {/if}
  {/if}
</section>

<style>
  #data-control-step {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    min-height: 0;
  }

  .dataset-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-03) 0;
    margin-bottom: var(--cds-spacing-03);
    flex-shrink: 0;
  }

  .dataset-meta {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .dataset-name-display {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .dataset-name-edit {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .dataset-name {
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .row-count {
    color: var(--cds-text-02);
    font-size: 0.875rem;
  }

  .duck-badge {
    background-color: var(--cds-support-02);
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    margin-left: var(--cds-spacing-03);
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
</style>
