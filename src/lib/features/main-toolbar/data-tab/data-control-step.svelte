<script lang="ts">
  import { dataTabState } from '$lib/features/commons/store/data-tab.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { DataTable, InlineNotification } from 'carbon-components-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';

  const expandedRowIds = $derived(dataTabState.dataControl.expandedRowIds);
  const selectedRowIds = $derived(dataTabState.dataControl.selectedRowIds);

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const allDatasets = $derived(datasetsStore.datasets);

  $effect(() => {
    console.log('All datasets in store:', allDatasets);
    console.log('Selected dataset:', selectedDataset);
    console.log('Datasets store processing:', datasetsStore.isProcessing);
  });

  const headers = $derived(
    selectedDataset &&
      selectedDataset.columns &&
      selectedDataset.columns.length > 0
      ? selectedDataset.columns.map((col) => ({
          key: col.name,
          value: `${col.name} (${col.type})`
        }))
      : []
  );

  const rows = $derived(
    selectedDataset && selectedDataset.data && selectedDataset.data.length > 0
      ? selectedDataset.data.slice(0, 100).map((row, index) => ({
          id: index,
          ...row
        }))
      : []
  );
</script>

<section id="data-control-step">
  <MainToolBarHeader title="1. Contrôler les données" />

  {#if selectedDataset}
    <div class="dataset-info">
      <span class="dataset-name">{selectedDataset.name}</span>
      <span class="row-count">{selectedDataset.rowCount} lignes</span>
    </div>

    <DataTable
      batchExpansion
      batchSelection
      expandedRowIds={expandedRowIds}
      selectedRowIds={selectedRowIds}
      on:click:row--expand={(e) => {
        const event = e as CustomEvent<{ expanded: boolean; row: any }>;
        // Row expand handler
      }}
      on:click:row--select={(e) => {
        const event = e as CustomEvent<{ selected: boolean; row: any }>;
        // Row select handler
      }}
      headers={headers}
      rows={rows}
      size="short"
    >
      <svelte:fragment slot="expanded-row" let:row>
        <div class="expanded-row-content">
          <pre>{JSON.stringify(row, null, 2)}</pre>
        </div>
      </svelte:fragment>
    </DataTable>

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
  }

  .dataset-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-03) 0;
    margin-bottom: var(--cds-spacing-03);
  }

  .dataset-name {
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .row-count {
    color: var(--cds-text-02);
    font-size: 0.875rem;
  }

  .expanded-row-content {
    padding: var(--cds-spacing-03);
    background-color: var(--cds-ui-01);
    border-radius: 4px;
  }

  .expanded-row-content pre {
    margin: 0;
    font-size: 0.75rem;
    color: var(--cds-text-02);
    white-space: pre-wrap;
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
