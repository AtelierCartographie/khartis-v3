<script lang="ts">
  import { Checkbox } from 'carbon-components-svelte';
  import type { ColumnInfo, TableRow } from '../types';

  interface Props {
    row: TableRow;
    rowIndex: number;
    visibleColumns: ColumnInfo[];
    isHighlighted: boolean;
    isSelectable?: boolean;
    isSelected?: boolean;
    onToggleSelection?: (rowId: number) => void;
  }

  const {
    row,
    visibleColumns,
    isHighlighted,
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

<tr class:highlight={isHighlighted} class:selected={isSelected}>
  {#if isSelectable}
    <td class="checkbox-cell">
      <Checkbox
        hideLabel
        checked={isSelected}
        on:change={handleCheckboxChange}
        labelText=""
      />
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
    border-bottom: 1px solid var(--cds-ui-03);
    transition: background-color 0.15s;
  }

  tr:hover {
    background-color: var(--cds-hover-ui);
  }

  tr.highlight {
    background-color: #a56eff;
  }

  tr.highlight td {
    color: white;
  }

  tr.highlight .null-value {
    color: rgba(255, 255, 255, 0.7);
  }

  tr.selected {
    background-color: var(--cds-selected-ui);
  }

  tr.selected:hover {
    background-color: var(--cds-selected-ui-hover, var(--cds-selected-ui));
  }

  .checkbox-cell {
    width: 52px;
    min-width: 52px;
    max-width: 52px;
    padding: 0 var(--cds-spacing-03);
    text-align: center;
    vertical-align: middle;
    position: sticky;
    left: 0;
    background-color: var(--cds-ui-01);
    z-index: 1;
  }

  .checkbox-cell :global(.bx--form-item) {
    margin: 0;
  }

  .checkbox-cell :global(.bx--checkbox-wrapper) {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 0 !important;
  }

  .checkbox-cell :global(.bx--checkbox-label) {
    padding: 0;
    min-height: 20px;
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
