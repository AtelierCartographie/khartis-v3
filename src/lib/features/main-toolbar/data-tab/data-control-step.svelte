<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/commons/services/duckdb-orchestrator.service';
  import { InlineNotification, DataTableSkeleton } from 'carbon-components-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import AdvancedDataTable from '$lib/features/commons/components/advanced-data-table.svelte';
  import { globalActions } from '$lib/features/commons/store/global.svelte';

  const selectedDataset = $derived(datasetsStore.selectedDataset);

  const currentDuckTable = $derived(
    selectedDataset
      ? duckDBOrchestrator.getAllDatasets().find(d => d.sourceFileId === selectedDataset.sourceFileId)?.tableName || null
      : null
  );

  // Sync button selection with the selected dataset
  $effect(() => {
    if (selectedDataset?.sourceFileId) {
      globalActions.selectDataButton(selectedDataset.sourceFileId, false);
    }
  });
</script>

<section id="data-control-step">
  <MainToolBarHeader title="1. Contrôler les données" />

  {#if selectedDataset}
    <div class="dataset-info">
      <span class="dataset-name">{selectedDataset.name}</span>
      <span class="row-count">{selectedDataset.rowCount} lignes</span>
      {#if currentDuckTable}
        <span class="duck-badge">DuckDB ✓</span>
      {/if}
    </div>

    <AdvancedDataTable
      dataset={selectedDataset}
      tableName={currentDuckTable || undefined}
      showSummaryPlots={false}
    />

    <InlineNotification
      title="Types des variables"
      subtitle="Khartis a détecté le type de chaque variable. Il apporte ensuite des suggestions de visualisations plus pertinentes."
      kind="info"
      lowContrast
      hideCloseButton={false}
    />

    {#if selectedDataset.columns.some((col) => col.nullable)}
      <InlineNotification
        title="Valeurs manquantes"
        subtitle="Certaines colonnes contiennent des valeurs manquantes qui pourraient affecter les visualisations."
        kind="warning"
        lowContrast
        hideCloseButton={false}
      />
    {/if}
  {:else}
    <div class="empty-state">
      <p>
        Aucune donnée chargée. Veuillez importer un fichier depuis l'onglet
        précédent.
      </p>
    </div>
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
  }

  .dataset-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-03) 0;
    margin-bottom: var(--cds-spacing-03);
    flex-shrink: 0;
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

  .empty-state p {
    margin: 0;
  }
</style>