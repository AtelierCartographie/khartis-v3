<script lang="ts">
  import type { ColumnInfo, TableRow } from '../types';

  interface Props {
    row: TableRow;
    rowIndex: number;
    visibleColumns: ColumnInfo[];
    isHighlighted: boolean;
  }

  const { row, visibleColumns, isHighlighted }: Props = $props();

  function isNumericType(type: string): boolean {
    return (
      type === 'number' ||
      type === 'integer' ||
      type === 'bigint' ||
      type === 'numeric'
    );
  }

  function formatValue(value: unknown, columnType: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (columnType === 'date' && value instanceof Date) {
      return value.toLocaleDateString('fr-FR');
    }

    if (isNumericType(columnType)) {
      return Number(value).toLocaleString('fr-FR');
    }

    return String(value);
  }
</script>

<tr class:highlight={isHighlighted}>
  {#each visibleColumns as col (col.name)}
    {@const value = row[col.name]}
    {@const isNumeric = isNumericType(col.type)}
    {@const isNull = value === null || value === undefined}
    <td class:numeric={isNumeric}>
      {#if isNull}
        <span class="null-value">—</span>
      {:else}
        {formatValue(value, col.type)}
      {/if}
    </td>
  {/each}
</tr>

<style>
  tr {
    border-bottom: 1px solid var(--cds-ui-03);
    transition: background-color 0.15s;
  }

  tr:hover {
    background-color: var(--cds-hover-ui);
  }

  tr.highlight {
    background-color: var(--cds-support-03);
  }

  td {
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    color: var(--cds-text-01);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  td.numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .null-value {
    color: var(--cds-text-03);
    font-style: italic;
  }
</style>
