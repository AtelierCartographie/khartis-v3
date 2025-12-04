<script lang="ts">
  import { RefineOperation, type AnalysisResult } from '$lib/features/duckdb';
  import SummaryPlot from '$lib/features/duckdb/services/duckdb/SummaryPlot.svelte';
  import OverflowMenuVertical from 'carbon-icons-svelte/lib/OverflowMenuVertical.svelte';
  import WarningAlt from 'carbon-icons-svelte/lib/WarningAlt.svelte';
  import * as m from '$lib/paraglide/messages';
  import type { ColumnInfo } from '../types';
  import { getPlotForColumn } from '../histogram.utils';
  import Portal from './Portal.svelte';

  interface ColumnTypeOption {
    label: string;
    value: string;
  }

  interface Props {
    column: ColumnInfo;
    analysis?: AnalysisResult;
    columnAnalysis: Map<string, AnalysisResult>;
    sortColumn: string | null;
    sortOrder: 'ASC' | 'DESC' | null;
    showSummaryPlots: boolean;
    isEditMode: boolean;
    columnTypeOptions: ColumnTypeOption[];
    onSort: (column: string, order: 'ASC' | 'DESC') => void;
    onRename: (columnName: string) => void;
    onChangeType: (columnName: string, type: string) => void;
    onRefine: (columnName: string, operation: RefineOperation) => void;
    onToggleVisibility: (columnName: string) => void;
    onDrop: (columnName: string) => void;
  }

  const {
    column,
    analysis,
    columnAnalysis,
    sortColumn,
    sortOrder,
    showSummaryPlots,
    isEditMode,
    columnTypeOptions,
    onSort,
    onRename,
    onChangeType,
    onRefine,
    onToggleVisibility,
    onDrop
  }: Props = $props();

  const plotElement = $derived(
    showSummaryPlots && analysis
      ? getPlotForColumn(column.name, columnAnalysis)
      : null
  );

  interface ColumnWarning {
    type: 'nulls' | 'duplicates' | 'low_uniques';
    message: string;
    severity: 'warning' | 'info';
  }

  const columnWarnings = $derived.by((): ColumnWarning[] => {
    if (!analysis) return [];
    const warnings: ColumnWarning[] = [];

    const shareNulls = analysis.share_nulls as number | undefined;
    const shareDuplicates = analysis.share_duplicates as number | undefined;
    const shareUniques = analysis.share_uniques as number | undefined;
    const nulls = analysis.nulls as number | undefined;
    const duplicates = analysis.duplicates as number | undefined;

    if (shareNulls !== undefined && shareNulls > 0.5) {
      warnings.push({
        type: 'nulls',
        message: `${Math.round(shareNulls * 100)}% de valeurs nulles (${nulls ?? 0})`,
        severity: 'warning'
      });
    }

    const isLikelyIdentifier = shareUniques !== undefined && shareUniques > 0.8;
    if (
      isLikelyIdentifier &&
      shareDuplicates !== undefined &&
      shareDuplicates > 0.01
    ) {
      warnings.push({
        type: 'duplicates',
        message: `${Math.round(shareDuplicates * 100)}% de doublons (${duplicates ?? 0}) - colonne identifiant?`,
        severity: 'warning'
      });
    }

    return warnings;
  });

  let menuOpen = $state(false);
  let menuButton = $state<HTMLButtonElement | null>(null);
  let menuPosition = $state({ top: 0, left: 0 });

  function toggleMenu() {
    if (menuOpen) {
      menuOpen = false;
    } else {
      if (menuButton) {
        const rect = menuButton.getBoundingClientRect();
        menuPosition = {
          top: rect.bottom + 2,
          left: rect.right
        };
      }
      menuOpen = true;
    }
  }

  function closeMenu() {
    menuOpen = false;
  }

  function handleClickOutside(event: MouseEvent) {
    if (menuButton && !menuButton.contains(event.target as Node)) {
      closeMenu();
    }
  }

  function handleMenuAction(action: () => void) {
    action();
    closeMenu();
  }

  $effect(() => {
    if (menuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<th>
  <div class="col-header">
    <div class="col-title-row">
      <span class="col-name" title={column.name}>{column.name}</span>
      {#if columnWarnings.length > 0}
        <span
          class="warning-badge"
          title={columnWarnings.map((w) => w.message).join('\n')}
        >
          <WarningAlt size={16} />
        </span>
      {/if}
      <div class="col-actions">
        {#if isEditMode}
          <button
            class="menu-trigger"
            bind:this={menuButton}
            onclick={toggleMenu}
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <OverflowMenuVertical size={16} />
          </button>
          {#if menuOpen}
            <Portal>
              <div
                class="dropdown-menu"
                style="top: {menuPosition.top}px; left: {menuPosition.left}px;"
                role="menu"
              >
                <button
                  class="menu-item"
                  onclick={() => handleMenuAction(() => onRename(column.name))}
                >
                  Renommer
                </button>
                <div class="menu-divider"></div>
                <span class="menu-label">{m.column_type_change()}</span>
                {#each columnTypeOptions as typeOption (typeOption.value)}
                  <button
                    class="menu-item menu-item-indent"
                    onclick={() =>
                      handleMenuAction(() =>
                        onChangeType(column.name, typeOption.value)
                      )}
                  >
                    → {typeOption.label}
                  </button>
                {/each}
                <div class="menu-divider"></div>
                <span class="menu-label">Affiner...</span>
                <button
                  class="menu-item menu-item-indent"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.UPPERCASE)
                    )}
                >
                  → MAJUSCULES
                </button>
                <button
                  class="menu-item menu-item-indent"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.LOWERCASE)
                    )}
                >
                  → minuscules
                </button>
                <button
                  class="menu-item menu-item-indent"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.TITLECASE)
                    )}
                >
                  → Casse Titre
                </button>
                <button
                  class="menu-item menu-item-indent"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.TRIM)
                    )}
                >
                  → Supprimer espaces
                </button>
                <button
                  class="menu-item menu-item-indent"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.TRIM_ALL)
                    )}
                >
                  → Espaces multiples
                </button>
                <div class="menu-divider"></div>
                <button
                  class="menu-item"
                  onclick={() =>
                    handleMenuAction(() => onToggleVisibility(column.name))}
                >
                  Masquer
                </button>
                <button
                  class="menu-item menu-item-danger"
                  onclick={() => handleMenuAction(() => onDrop(column.name))}
                >
                  Supprimer
                </button>
              </div>
            </Portal>
          {/if}
        {/if}
        <div class="sort-buttons">
          <button
            class="sort-btn"
            class:active={sortColumn === column.name && sortOrder === 'ASC'}
            onclick={() => onSort(column.name, 'ASC')}
            title="Tri croissant"
          >
            ▲
          </button>
          <button
            class="sort-btn"
            class:active={sortColumn === column.name && sortOrder === 'DESC'}
            onclick={() => onSort(column.name, 'DESC')}
            title="Tri décroissant"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
    {#if showSummaryPlots && analysis}
      <div class="summary-plot">
        {#if plotElement}
          <SummaryPlot svgElement={plotElement} />
        {:else if analysis.type_simple === 'string'}
          <span class="unique-count"
            >{analysis.uniques ?? 0} valeurs uniques</span
          >
        {/if}
      </div>
    {/if}
  </div>
</th>

<style>
  th {
    text-align: left;
    vertical-align: top;
    padding: var(--cds-spacing-03);
    border-bottom: 2px solid var(--cds-ui-03);
    min-width: 150px;
  }

  .col-header {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .col-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-02);
  }

  .col-name {
    font-weight: 600;
    color: var(--cds-text-01);
    font-size: 0.875rem;
    flex: 1;
  }

  .col-actions {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .menu-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--cds-text-02);
    cursor: pointer;
    border-radius: 2px;
  }

  .menu-trigger:hover {
    background-color: var(--cds-hover-ui);
    color: var(--cds-text-01);
  }

  :global(.dropdown-menu) {
    position: fixed;
    transform: translateX(-100%);
    min-width: 180px;
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-03);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    max-height: 400px;
    overflow-y: auto;
  }

  :global(.dropdown-menu .menu-item) {
    display: block;
    width: 100%;
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--cds-text-01);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  :global(.dropdown-menu .menu-item:hover) {
    background-color: var(--cds-hover-ui);
  }

  :global(.dropdown-menu .menu-item-indent) {
    padding-left: 24px;
  }

  :global(.dropdown-menu .menu-item-danger) {
    color: var(--cds-support-01);
  }

  :global(.dropdown-menu .menu-item-danger:hover) {
    background-color: var(--cds-support-01);
    color: var(--cds-text-04);
  }

  :global(.dropdown-menu .menu-divider) {
    height: 1px;
    background-color: var(--cds-ui-03);
    margin: 4px 0;
  }

  :global(.dropdown-menu .menu-label) {
    display: block;
    padding: 8px 16px 4px;
    font-size: 12px;
    color: var(--cds-text-02);
    font-weight: 600;
  }

  .sort-buttons {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .sort-btn {
    border: none;
    background: none;
    padding: 0;
    color: var(--cds-text-02);
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
  }

  .sort-btn:hover {
    color: var(--cds-text-01);
  }

  .sort-btn.active {
    color: var(--cds-text-01);
  }

  .summary-plot {
    height: 64px;
    margin-top: var(--cds-spacing-02);
  }

  .unique-count {
    display: inline-block;
    background-color: var(--cds-ui-03);
    color: var(--cds-text-01);
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 9px;
    font-weight: 500;
  }

  .warning-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cds-support-03);
    cursor: help;
    flex-shrink: 0;
  }

  .warning-badge:hover {
    color: var(--cds-support-01);
  }
</style>
