<script lang="ts">
  import SimpleCheckbox from '$lib/features/commons/components/simple-checkbox.svelte';
  import {
    formatValueByType,
    isNumericType
  } from '$lib/features/commons/utils/format.utils';
  import { projectHtmlLikeValue } from '$lib/features/commons/utils/html-like-text.utils';
  import * as m from '$lib/paraglide/messages';
  import type { HighlightType } from '../advanced-data-table.svelte';
  import type { ColumnInfo, TableRow } from '../types';

  interface Props {
    row: TableRow;
    rowIndex: number;
    visibleColumns: ColumnInfo[];
    highlightType?: HighlightType;
    getCellHighlight?: (columnName: string) => HighlightType;
    isSelectable?: boolean;
    isSelected?: boolean;
    showRowNumbers?: boolean;
    geoidColumns?: Set<string>;
    onToggleSelection?: (rowId: number) => void;
  }

  const {
    row,
    rowIndex,
    visibleColumns,
    highlightType = null,
    getCellHighlight,
    isSelectable = false,
    isSelected = false,
    showRowNumbers = true,
    geoidColumns = new Set<string>(),
    onToggleSelection
  }: Props = $props();

  const rowId = $derived((row.__id as number | undefined) ?? -1);
  const displayIndex = $derived(rowIndex + 1);

  function handleCheckboxChange() {
    if (rowId !== -1) {
      onToggleSelection?.(rowId);
    }
  }
</script>

<tr
  data-row-id={rowId}
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
  {#if showRowNumbers}
    <td class="row-index-cell">{displayIndex}</td>
  {/if}
  {#each visibleColumns as col (col.name)}
    {@const value = row[col.name]}
    {@const isNumeric = isNumericType(col.type)}
    {@const isNull = value === null || value === undefined}
    {@const displayValue = projectHtmlLikeValue(value)}
    {@const cellHighlight = getCellHighlight?.(col.name)}
    {@const isGeoid = geoidColumns.has(col.name)}
    <td
      class:numeric={isNumeric}
      class:geoid={isGeoid}
      class:cell-highlight-current={cellHighlight === 'current'}
      class:cell-highlight-exact={cellHighlight === 'exact'}
      class:cell-highlight-contains={cellHighlight === 'contains'}
      class:cell-highlight-partial={cellHighlight === 'partial'}
      data-column={col.name}
    >
      {#if isNull}
        <span class="null-value" title={m.cell_null_value_tooltip()}
          >{m.cell_null_value_symbol()}</span
        >
      {:else}
        {formatValueByType(displayValue, col.type)}
      {/if}
    </td>
  {/each}
</tr>

<style>
  tr {
    height: 32px;
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    transition: background-color 0.15s;
    background-color: var(--cds-ui-01, #ffffff);
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
    color: var(--cds-text-01, #161616);
  }

  tr.highlight-partial {
    background-color: #ece0ff;
  }

  tr.highlight-partial td {
    color: var(--cds-text-01, #161616);
  }

  tr.selected {
    background-color: var(--cds-selected-ui);
  }

  tr.selected:hover {
    background-color: var(--cds-selected-ui-hover, var(--cds-selected-ui));
  }

  tr .checkbox-cell {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
    height: 32px;
    padding: 0;
    position: sticky;
    left: 0;
    background-color: var(--cds-ui-01, #ffffff);
    z-index: var(--z-base);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  tr .row-index-cell {
    width: 40px;
    min-width: 40px;
    max-width: 40px;
    padding: 6px 0;
    text-align: center;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-03, #a8a8a8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
  }

  td {
    padding: 7px 8px;
    color: var(--cds-text-01, #161616);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
    vertical-align: middle;
    height: 32px;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    letter-spacing: 0.32px;
  }

  td.numeric {
    text-align: left;
    font-variant-numeric: tabular-nums;
  }

  td.geoid {
    color: var(--tag-teal-tag-color, #005d5d);
    border-bottom: 2px solid var(--tag-teal-tag-border-operational, #08bdba);
  }

  .null-value {
    color: var(--cds-text-03, #a8a8a8);
    font-style: italic;
  }

  td.cell-highlight-current {
    background-color: #a56eff !important;
    color: white !important;
    font-weight: 600;
  }

  td.cell-highlight-current .null-value {
    color: rgba(255, 255, 255, 0.7) !important;
  }

  td.cell-highlight-exact {
    background-color: #c8a8ff !important;
    color: var(--cds-text-01, #161616);
  }

  td.cell-highlight-contains {
    background-color: #d4b9ff !important;
    color: var(--cds-text-01, #161616);
  }

  td.cell-highlight-partial {
    background-color: #e8d9ff !important;
    color: var(--cds-text-01, #161616);
  }
</style>
