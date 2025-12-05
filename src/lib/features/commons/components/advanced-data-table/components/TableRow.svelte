<script lang="ts">
  import SimpleCheckbox from '$lib/features/commons/components/simple-checkbox.svelte';
  import type { HighlightType } from '../advanced-data-table.svelte';
  import type { ColumnInfo, TableRow } from '../types';

  interface Props {
    row: TableRow;
    rowIndex: number;
    visibleColumns: ColumnInfo[];
    highlightType?: HighlightType;
    isSelectable?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (rowId: number) => void;
  }

  const {
    row,
    visibleColumns,
    highlightType = null,
    isSelectable = false,
    isSelected = false,
    onToggleSelection
  }: Props = $props();

  const rowId = $derived((row.__id as number | undefined) ?? -1);

  function handleCheckboxChange() {
    if (rowId !== -1) {
      onToggleSelection?.(rowId);
    }
  }

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

<tr
  class:highlight-current={highlightType === 'current'}
  class:highlight-exact={highlightType === 'exact'}
  class:highlight-partial={highlightType === 'partial'}
  class:selected={isSelected}
>
  {#if isSelectable}
    <td class="checkbox-cell">
      <SimpleCheckbox checked={isSelected} onchange={handleCheckboxChange} />
    </td>
  {/if}
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
    height: 26px;
    border-bottom: 1px solid var(--cds-ui-03);
    transition: background-color 0.15s;
  }

  tr:hover {
    background-color: var(--cds-hover-ui);
  }

  tr.highlight-current {
    background-color: #a56eff;
  }

  tr.highlight-current td {
    color: white;
  }

  tr.highlight-current .null-value {
    color: rgba(255, 255, 255, 0.7);
  }

  tr.highlight-exact {
    background-color: #d4b9ff;
  }

  tr.highlight-exact td {
    color: var(--cds-text-01);
  }

  tr.highlight-partial {
    background-color: #ece0ff;
  }

  tr.highlight-partial td {
    color: var(--cds-text-01);
  }

  tr.selected {
    background-color: var(--cds-selected-ui);
  }

  tr.selected:hover {
    background-color: var(--cds-selected-ui-hover, var(--cds-selected-ui));
  }

  .checkbox-cell {
    width: 40px;
    min-width: 40px;
    max-width: 40px;
    height: 26px;
    padding: 0;
    position: sticky;
    left: 0;
    background-color: var(--cds-ui-01);
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  td {
    padding: var(--cds-spacing-01) var(--cds-spacing-03);
    color: var(--cds-text-01);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
    vertical-align: middle;
    height: 26px;
    font-size: 0.75rem;
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
