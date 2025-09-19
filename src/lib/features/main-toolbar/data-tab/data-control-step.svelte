<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/commons/services/duckdb-orchestrator.service';
  import { InlineNotification, DataTableSkeleton } from 'carbon-components-svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import { untrack } from 'svelte';

  const selectedDataset = $derived(datasetsStore.selectedDataset);

  let tableData = $state<any[]>([]);
  let columns = $state<any[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Get current DuckDB table name
  const currentDuckTable = $derived(
    selectedDataset
      ? duckDBOrchestrator.getAllDatasets().find(d => d.sourceFileId === selectedDataset.sourceFileId)?.tableName || null
      : null
  );

  // Derive display data from the selected dataset
  const displayData = $derived.by(() => {
    if (!selectedDataset) {
      console.log('[DataControlStep] No selected dataset');
      return { columns: [], data: [] };
    }

    const snapshotDataset = $state.snapshot(selectedDataset);
    console.log('[DataControlStep.displayData] Snapshot dataset:', {
      name: snapshotDataset.name,
      columnsLength: snapshotDataset.columns?.length,
      dataLength: snapshotDataset.data?.length,
      firstRow: snapshotDataset.data?.[0]
    });

    return {
      columns: snapshotDataset.columns?.map(col => ({
        name: col.name,
        type: col.type
      })) || [],
      data: snapshotDataset.data?.slice(0, 100) || []
    };
  });

  $effect(() => {
    console.log('[DataControlStep] Effect triggered');
    console.log('[DataControlStep] selectedDataset exists:', !!selectedDataset);
    console.log('[DataControlStep] currentDuckTable:', currentDuckTable);
    console.log('[DataControlStep] displayData:', {
      columnsLength: displayData.columns.length,
      dataLength: displayData.data.length
    });

    if (currentDuckTable) {
      console.log('[DataControlStep] Loading DuckDB data for table:', currentDuckTable);
      untrack(() => loadDuckDBData());
    } else {
      // Use derived data directly
      untrack(() => {
        columns = displayData.columns;
        tableData = displayData.data;
        console.log('[DataControlStep] Dataset data set - columns:', columns.length, 'rows:', tableData.length);
        if (columns.length > 0) {
          console.log('[DataControlStep] First column:', columns[0]);
        }
        if (tableData.length > 0) {
          console.log('[DataControlStep] First row:', tableData[0]);
        }
      });
    }
  });

  async function loadDuckDBData() {
    if (!currentDuckTable) return;

    console.log('[DataControlStep.loadDuckDBData] Starting load for table:', currentDuckTable);
    isLoading = true;
    error = null;

    try {
      const data = await duckDBOrchestrator.getTableData(currentDuckTable);
      console.log('[DataControlStep.loadDuckDBData] Data received:', data);

      if (data && data.numRows > 0) {
        // Get columns from first row
        const firstRow = data.get(0);
        console.log('[DataControlStep.loadDuckDBData] First row:', firstRow);

        columns = Object.keys(firstRow).filter(name => name !== 'geom').map(name => ({
          name,
          type: typeof firstRow[name]
        }));
        console.log('[DataControlStep.loadDuckDBData] Columns:', columns);

        // Load first 100 rows
        tableData = [];
        const limit = Math.min(100, data.numRows);
        for (let i = 0; i < limit; i++) {
          tableData.push(data.get(i));
        }
        console.log('[DataControlStep.loadDuckDBData] Loaded rows:', tableData.length);
      } else {
        console.log('[DataControlStep.loadDuckDBData] No data or empty table');
      }
    } catch (err) {
      console.error('[DataControlStep.loadDuckDBData] Error:', err);
      error = err instanceof Error ? err.message : 'Failed to load data';
    } finally {
      isLoading = false;
      console.log('[DataControlStep.loadDuckDBData] Loading complete. Data length:', tableData.length);
    }
  }
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

    {#if isLoading}
      <DataTableSkeleton headers={['Loading...']} rows={5} />
    {:else if error}
      <InlineNotification
        title="Erreur"
        subtitle={error}
        kind="error"
        lowContrast
      />
    {:else if tableData.length > 0}
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              {#each columns as col}
                <th>
                  <div class="column-header">
                    <span class="column-name">{col.name}</span>
                    <span class="column-type">{col.type}</span>
                  </div>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each tableData as row, i}
              <tr>
                {#each columns as col}
                  <td>
                    <div class="cell-content">
                      {row[col.name] !== null && row[col.name] !== undefined ? row[col.name] : ''}
                    </div>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="no-data">
        <p>Aucune donnée disponible</p>
      </div>
    {/if}

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

  .data-table-container {
    flex: 1;
    overflow: auto;
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-03);
    border-radius: 4px;
    margin-bottom: var(--cds-spacing-04);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .data-table thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--cds-ui-02);
  }

  .data-table th {
    padding: var(--cds-spacing-03);
    text-align: left;
    border-bottom: 2px solid var(--cds-ui-03);
    font-weight: 600;
  }

  .column-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .column-name {
    color: var(--cds-text-01);
  }

  .column-type {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .data-table tbody tr {
    border-bottom: 1px solid var(--cds-ui-03);
  }

  .data-table tbody tr:hover {
    background-color: var(--cds-hover-ui);
  }

  .data-table td {
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    color: var(--cds-text-01);
  }

  .cell-content {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-data {
    padding: var(--cds-spacing-05);
    text-align: center;
    color: var(--cds-text-02);
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