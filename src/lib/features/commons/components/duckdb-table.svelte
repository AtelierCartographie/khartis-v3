<script lang="ts" module>
  function getColumnTypeTag(type: string): string {
    const tagMap: Record<string, string> = {
      numeric: 'blue',
      text: 'green',
      date: 'magenta',
      boolean: 'purple',
      geometry: 'red'
    };
    return tagMap[type] || 'gray';
  }
</script>

<script lang="ts">
  import { DataTable, DataTableSkeleton, Tag } from 'carbon-components-svelte';
  import { onMount } from 'svelte';
  import { duckDBOrchestrator } from '../services/duckdb-orchestrator.service';
  import type { ArrowTableLike } from '../services/duckdb/types';
  import { logger, LogCategory } from '../utils/logger';

  interface Props {
    tableName: string;
    maxRows?: number;
  }

  let { tableName, maxRows = 100 }: Props = $props();

  let columns = $state<any[]>([]);
  let rows = $state<any[]>([]);
  let totalRows = $state(0);
  let isLoading = $state(true);
  let arrowTable = $state<ArrowTableLike | null>(null);

  onMount(async () => {
    await loadTableData();
  });

  async function loadTableData() {
    try {
      isLoading = true;

      const tableData = await duckDBOrchestrator.getTableData(tableName);
      arrowTable = tableData;

      if (tableData && tableData.numRows > 0) {
        totalRows = tableData.numRows;
        const firstRow = tableData.get(0);
        columns = Object.keys(firstRow)
          .filter((name) => name !== 'geom')
          .map((name) => ({
            name,
            type_simple: typeof firstRow[name]
          }));
      }

      const displayRows = [];
      const limit = Math.min(maxRows, totalRows);

      for (let i = 0; i < limit; i++) {
        const rowData = arrowTable!.get(i);
        displayRows.push({
          id: i.toString(),
          ...rowData
        });
      }

      rows = displayRows;
    } catch (error) {
      logger.error('Error loading table data', LogCategory.UI, error);
    } finally {
      isLoading = false;
    }
  }

  function _getColumnType(type: string): string {
    const typeMap: Record<string, string> = {
      numeric: 'number',
      text: 'string',
      date: 'date',
      boolean: 'boolean',
      geometry: 'geometry'
    };
    return typeMap[type] || 'string';
  }

  function formatValue(value: any, type: string): string {
    if (value === null || value === undefined) return '';

    switch (type) {
      case 'date':
        return new Date(value).toLocaleDateString();

      case 'numeric':
        return typeof value === 'number' ? value.toLocaleString() : value;

      default:
        return String(value);
    }
  }
</script>

{#if isLoading}
  <DataTableSkeleton headers={['Column 1', 'Column 2', 'Column 3']} rows={10} />
{:else}
  <div class="table-info">
    <p>Dataset: <strong>{tableName}</strong></p>
    <p>Total rows: <strong>{totalRows.toLocaleString()}</strong></p>
    {#if totalRows > maxRows}
      <Tag type="purple">Showing first {maxRows} rows</Tag>
    {/if}
  </div>

  <DataTable
    size="short"
    headers={columns.map((col) => ({
      key: col.name,
      value: col.name
    }))}
    rows={rows}
    batchExpansion
    batchSelection
  >
    <svelte:fragment slot="cell" let:cell>
      {@const column = columns.find((col) => col.name === cell.key)}
      {@const value = cell.value}

      <div
        class="cell-content"
        class:numeric={column?.type_simple === 'numeric'}
      >
        {#if column}
          {formatValue(value, column.type_simple)}
        {:else}
          {value}
        {/if}
      </div>
    </svelte:fragment>

    <svelte:fragment slot="expanded-row" let:row>
      <div class="expanded-content">
        <pre>{JSON.stringify(row, null, 2)}</pre>
      </div>
    </svelte:fragment>
  </DataTable>

  <div class="column-summary">
    <h4>Column Summary</h4>
    <div class="summary-grid">
      {#each columns as col (col.name)}
        <div class="column-card">
          <div class="column-header">
            <span class="column-name">{col.name}</span>
            <Tag size="sm" type={getColumnTypeTag(col.type_simple) as any}>
              {col.type_simple}
            </Tag>
          </div>

          <div class="column-stats">
            {#if col.type_simple === 'numeric'}
              <div class="stat">
                <span class="stat-label">Min:</span>
                <span class="stat-value"
                  >{col.min?.toLocaleString() || 'N/A'}</span
                >
              </div>
              <div class="stat">
                <span class="stat-label">Max:</span>
                <span class="stat-value"
                  >{col.max?.toLocaleString() || 'N/A'}</span
                >
              </div>
            {/if}

            <div class="stat">
              <span class="stat-label">Nulls:</span>
              <span class="stat-value">{col.nulls || 0}</span>
            </div>

            {#if col.type_simple === 'text'}
              <div class="stat">
                <span class="stat-label">Unique:</span>
                <span class="stat-value">{col.unique || 'N/A'}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .table-info {
    padding: var(--cds-spacing-05) 0;
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-05);
  }

  .cell-content {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-content.numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .expanded-content {
    padding: var(--cds-spacing-05);
    background-color: var(--cds-ui-01);
  }

  .expanded-content pre {
    margin: 0;
    font-size: 0.875rem;
  }

  .column-summary {
    margin-top: var(--cds-spacing-07);
    padding: var(--cds-spacing-05);
    background-color: var(--cds-ui-01);
    border-radius: 4px;
  }

  .column-summary h4 {
    margin: 0 0 var(--cds-spacing-05) 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--cds-spacing-05);
  }

  .column-card {
    padding: var(--cds-spacing-04);
    background-color: var(--cds-ui-02);
    border-radius: 4px;
  }

  .column-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--cds-spacing-03);
  }

  .column-name {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .column-stats {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .stat {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
  }

  .stat-label {
    color: var(--cds-text-02);
  }

  .stat-value {
    font-weight: 500;
  }
</style>
