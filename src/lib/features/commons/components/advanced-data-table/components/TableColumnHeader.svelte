<script lang="ts">
  import SummaryPlot from '$lib/features/commons/components/summary-plot/SummaryPlot.svelte';
  import { RefineOperation, type AnalysisResult } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';
  import Calendar from 'carbon-icons-svelte/lib/Calendar.svelte';
  import ChartMultitype from 'carbon-icons-svelte/lib/ChartMultitype.svelte';
  import Edit from 'carbon-icons-svelte/lib/Edit.svelte';
  import Link from 'carbon-icons-svelte/lib/Link.svelte';
  import OverflowMenuVertical from 'carbon-icons-svelte/lib/OverflowMenuVertical.svelte';
  import TrashCan from 'carbon-icons-svelte/lib/TrashCan.svelte';
  import ViewOff from 'carbon-icons-svelte/lib/ViewOff.svelte';
  import WarningAlt from 'carbon-icons-svelte/lib/WarningAlt.svelte';
  import {
    GEOID_SCORE_THRESHOLD,
    getColumnTypeStyle,
    SEMIO_BADGE_STYLES
  } from '../column-type-styles';
  import { getPlotForColumn } from '../histogram.utils';
  import type { ColumnInfo } from '../types';
  import Portal from './Portal.svelte';

  export type ColumnType = 'text' | 'number' | 'date' | 'boolean';

  interface Props {
    column: ColumnInfo;
    analysis?: AnalysisResult;
    columnAnalysis: Map<string, AnalysisResult>;
    sortColumn: string | null;
    sortOrder: 'ASC' | 'DESC' | null;
    showSummaryPlots: boolean;
    isEditMode: boolean;
    isHidden?: boolean;
    onSort: (column: string, order: 'ASC' | 'DESC') => void;
    onRefine: (columnName: string, operation: RefineOperation) => void;
    onRename?: (columnName: string) => void;
    onChangeType?: (columnName: string, newType: ColumnType) => void;
    onHide?: (columnName: string) => void;
    onDelete?: (columnName: string) => void;
  }

  const {
    column,
    analysis,
    columnAnalysis,
    sortColumn,
    sortOrder,
    showSummaryPlots,
    isEditMode,
    isHidden = false,
    onSort,
    onRefine,
    onRename,
    onChangeType,
    onHide,
    onDelete
  }: Props = $props();

  const typeOptions: { value: ColumnType; label: string }[] = [
    { value: 'text', label: m.column_type_text() },
    { value: 'number', label: m.column_type_number() },
    { value: 'date', label: m.column_type_date() },
    { value: 'boolean', label: m.column_type_boolean() }
  ];

  let showTypeSubmenu = $state(false);

  const plotElement = $derived(
    showSummaryPlots && analysis
      ? getPlotForColumn(column.name, columnAnalysis)
      : null
  );

  const typeStyle = $derived(getColumnTypeStyle(analysis?.type_simple));

  const typeTooltipMessage = $derived.by(() => {
    const typeSimple = analysis?.type_simple;
    if (typeSimple === 'numeric') return m.column_type_numeric_tooltip();
    if (typeSimple === 'date') return m.column_type_date_tooltip();
    if (typeSimple === 'string') return m.column_type_text_tooltip();
    return m.column_type_text_tooltip();
  });

  const showGeoidBadge = $derived(
    analysis?.semioType === 'geoid' &&
      (analysis?.semioScore ?? 0) >= GEOID_SCORE_THRESHOLD
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
        message: m.column_warning_nulls_detailed({
          percent: Math.round(shareNulls * 100),
          count: nulls ?? 0
        }),
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
        message: m.column_warning_duplicates_detailed({
          percent: Math.round(shareDuplicates * 100),
          count: duplicates ?? 0
        }),
        severity: 'warning'
      });
    }

    return warnings;
  });

  let menuOpen = $state(false);
  let menuButton = $state<HTMLButtonElement | null>(null);
  let menuPosition = $state({ top: 0, left: 0 });

  let warningTooltipOpen = $state(false);
  let warningBadgeRef = $state<HTMLElement | null>(null);
  let warningTooltipPosition = $state({ top: 0, left: 0 });

  let typeTooltipOpen = $state(false);
  let typeBadgeRef = $state<HTMLElement | null>(null);
  let typeTooltipPosition = $state({ top: 0, left: 0 });

  let geoidTooltipOpen = $state(false);
  let geoidBadgeRef = $state<HTMLElement | null>(null);
  let geoidTooltipPosition = $state({ top: 0, left: 0 });

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

  function showWarningTooltip() {
    if (warningBadgeRef) {
      const rect = warningBadgeRef.getBoundingClientRect();
      warningTooltipPosition = {
        top: rect.bottom + 4,
        left: rect.left + rect.width / 2
      };
    }
    warningTooltipOpen = true;
  }

  function hideWarningTooltip() {
    warningTooltipOpen = false;
  }

  function toggleWarningTooltip() {
    if (warningTooltipOpen) {
      hideWarningTooltip();
    } else {
      showWarningTooltip();
    }
  }

  function showTypeTooltip() {
    if (typeBadgeRef) {
      const rect = typeBadgeRef.getBoundingClientRect();
      typeTooltipPosition = {
        top: rect.bottom + 4,
        left: rect.left + rect.width / 2
      };
    }
    typeTooltipOpen = true;
  }

  function hideTypeTooltip() {
    typeTooltipOpen = false;
  }

  function showGeoidTooltip() {
    if (geoidBadgeRef) {
      const rect = geoidBadgeRef.getBoundingClientRect();
      geoidTooltipPosition = {
        top: rect.bottom + 4,
        left: rect.left + rect.width / 2
      };
    }
    geoidTooltipOpen = true;
  }

  function hideGeoidTooltip() {
    geoidTooltipOpen = false;
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
      <button
        class="type-badge"
        style="--badge-color: {typeStyle.color}"
        bind:this={typeBadgeRef}
        onmouseenter={showTypeTooltip}
        onmouseleave={hideTypeTooltip}
        onfocus={showTypeTooltip}
        onblur={hideTypeTooltip}
        aria-label={typeTooltipMessage}
      >
        {#if analysis?.type_simple === 'date'}
          <Calendar size={16} />
        {:else if typeStyle.label}
          {typeStyle.label}
        {/if}
      </button>
      {#if typeTooltipOpen}
        <Portal>
          <div
            class="simple-tooltip"
            style="top: {typeTooltipPosition.top}px; left: {typeTooltipPosition.left}px;"
            role="tooltip"
          >
            <div class="simple-tooltip-arrow"></div>
            {typeTooltipMessage}
          </div>
        </Portal>
      {/if}
      {#if showGeoidBadge}
        <button
          class="semio-badge"
          style="--badge-color: {SEMIO_BADGE_STYLES.geoid.color}"
          bind:this={geoidBadgeRef}
          onmouseenter={showGeoidTooltip}
          onmouseleave={hideGeoidTooltip}
          onfocus={showGeoidTooltip}
          onblur={hideGeoidTooltip}
          aria-label={SEMIO_BADGE_STYLES.geoid.tooltip()}
        >
          <Link size={16} />
        </button>
        {#if geoidTooltipOpen}
          <Portal>
            <div
              class="simple-tooltip"
              style="top: {geoidTooltipPosition.top}px; left: {geoidTooltipPosition.left}px;"
              role="tooltip"
            >
              <div class="simple-tooltip-arrow"></div>
              {SEMIO_BADGE_STYLES.geoid.tooltip()}
            </div>
          </Portal>
        {/if}
      {/if}
      <span
        class="col-name"
        style="color: {typeStyle.color}"
        title={column.name}>{column.name}</span
      >
      {#if columnWarnings.length > 0}
        <button
          class="warning-badge"
          bind:this={warningBadgeRef}
          onclick={toggleWarningTooltip}
          onmouseenter={showWarningTooltip}
          onmouseleave={hideWarningTooltip}
          onfocus={showWarningTooltip}
          onblur={hideWarningTooltip}
          aria-label={m.column_warning_label()}
          aria-describedby="warning-tooltip-{column.name}"
        >
          <WarningAlt size={16} />
        </button>
        {#if warningTooltipOpen}
          <Portal>
            <div
              id="warning-tooltip-{column.name}"
              class="warning-tooltip"
              style="top: {warningTooltipPosition.top}px; left: {warningTooltipPosition.left}px;"
              role="tooltip"
            >
              <div class="warning-tooltip-arrow"></div>
              {#each columnWarnings as warning}
                <div class="warning-tooltip-item">
                  <WarningAlt size={16} />
                  <span>{warning.message}</span>
                </div>
              {/each}
            </div>
          </Portal>
        {/if}
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
                <span class="menu-label">{m.column_refine_label()}</span>
                <button
                  class="menu-item"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.UPPERCASE)
                    )}
                >
                  {m.column_refine_uppercase()}
                </button>
                <button
                  class="menu-item"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.LOWERCASE)
                    )}
                >
                  {m.column_refine_lowercase()}
                </button>
                <button
                  class="menu-item"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.TITLECASE)
                    )}
                >
                  {m.column_refine_titlecase()}
                </button>
                <button
                  class="menu-item"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.TRIM)
                    )}
                >
                  {m.column_refine_trim()}
                </button>
                <button
                  class="menu-item"
                  onclick={() =>
                    handleMenuAction(() =>
                      onRefine(column.name, RefineOperation.TRIM_ALL)
                    )}
                >
                  {m.column_refine_trim_all()}
                </button>

                <div class="menu-divider"></div>

                {#if onRename}
                  <button
                    class="menu-item menu-item-with-icon"
                    onclick={() =>
                      handleMenuAction(() => onRename(column.name))}
                  >
                    <Edit size={16} />
                    {m.column_rename_action()}
                  </button>
                {/if}

                {#if onChangeType}
                  <div
                    class="menu-item menu-item-with-icon submenu-trigger"
                    role="menuitem"
                    tabindex="0"
                    onmouseenter={() => (showTypeSubmenu = true)}
                    onmouseleave={() => (showTypeSubmenu = false)}
                    onfocus={() => (showTypeSubmenu = true)}
                    onblur={() => (showTypeSubmenu = false)}
                  >
                    <ChartMultitype size={16} />
                    {m.column_type_change()}
                    <span class="submenu-arrow">▶</span>
                    {#if showTypeSubmenu}
                      <div class="submenu">
                        {#each typeOptions as option (option.value)}
                          <button
                            class="menu-item"
                            onclick={() =>
                              handleMenuAction(() =>
                                onChangeType(column.name, option.value)
                              )}
                          >
                            {option.label}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}

                <div class="menu-divider"></div>

                {#if onHide}
                  <button
                    class="menu-item menu-item-with-icon"
                    onclick={() => handleMenuAction(() => onHide(column.name))}
                  >
                    <ViewOff size={16} />
                    {isHidden ? m.column_show() : m.column_hide()}
                  </button>
                {/if}

                {#if onDelete}
                  <button
                    class="menu-item menu-item-with-icon menu-item-danger"
                    onclick={() =>
                      handleMenuAction(() => onDelete(column.name))}
                  >
                    <TrashCan size={16} />
                    {m.column_delete_action()}
                  </button>
                {/if}
              </div>
            </Portal>
          {/if}
        {/if}
        <div class="sort-buttons">
          <button
            class="sort-btn"
            class:active={sortColumn === column.name && sortOrder === 'ASC'}
            onclick={() => onSort(column.name, 'ASC')}
            title={m.column_sort_asc()}
          >
            ▲
          </button>
          <button
            class="sort-btn"
            class:active={sortColumn === column.name && sortOrder === 'DESC'}
            onclick={() => onSort(column.name, 'DESC')}
            title={m.column_sort_desc()}
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
          <!-- Afficher le compteur uniques sous le plot pour colonnes numériques/date -->
          {#if analysis.uniques !== undefined && analysis.uniques > 0 && analysis.type_simple !== 'string'}
            <span
              class="unique-count unique-count-secondary"
              title={m.column_distinct_values_title()}
            >
              {m.column_unique_count({ count: analysis.uniques })}
            </span>
          {/if}
        {:else if analysis.type_simple === 'string'}
          <span
            class="unique-count"
            style="background-color: {typeStyle.color}"
            title={m.column_categories_tooltip()}
          >
            {m.column_unique_count({ count: analysis.uniques ?? 0 })}
          </span>
        {/if}
      </div>
    {/if}
  </div>
</th>

<style>
  th {
    text-align: left;
    vertical-align: top;
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    border-bottom: 2px solid var(--cds-ui-03);
    min-width: 150px;
  }

  .col-header {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-01);
  }

  .col-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-02);
  }

  .type-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 18px;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    background-color: var(--badge-color);
    color: #fff;
    flex-shrink: 0;
    border: none;
    cursor: pointer;
    transition: filter 0.15s;
  }

  .type-badge:hover,
  .type-badge:focus {
    filter: brightness(1.1);
    outline: none;
  }

  .semio-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 18px;
    border-radius: 3px;
    background-color: var(--badge-color);
    color: white;
    flex-shrink: 0;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: filter 0.15s;
  }

  .semio-badge:hover,
  .semio-badge:focus {
    filter: brightness(1.1);
    outline: none;
  }

  .col-name {
    font-weight: 600;
    color: var(--cds-text-01);
    font-size: 0.75rem;
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

  :global(.dropdown-menu .menu-item-with-icon) {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :global(.dropdown-menu .submenu-trigger) {
    position: relative;
    cursor: pointer;
  }

  :global(.dropdown-menu .submenu-arrow) {
    margin-left: auto;
    font-size: 10px;
    color: var(--cds-text-02);
  }

  :global(.dropdown-menu .submenu) {
    position: absolute;
    left: 100%;
    top: 0;
    min-width: 140px;
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-03);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    z-index: 10001;
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
    position: relative;
    z-index: 1;
    pointer-events: auto;
  }

  .unique-count {
    display: inline-block;
    background-color: var(--cds-ui-03);
    color: #ffffff;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 9px;
    font-weight: 500;
  }

  .unique-count-secondary {
    position: absolute;
    bottom: 2px;
    right: 2px;
    background-color: var(--cds-ui-02);
    color: var(--cds-text-02);
    padding: 2px 6px;
    border-radius: 8px;
    font-size: 8px;
  }

  .warning-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cds-support-03);
    cursor: pointer;
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 2px;
    border-radius: 2px;
  }

  .warning-badge:hover,
  .warning-badge:focus {
    color: var(--cds-support-01);
    background-color: var(--cds-hover-ui);
    outline: none;
  }

  :global(.warning-tooltip) {
    position: fixed;
    transform: translateX(-50%);
    background-color: var(--cds-inverse-01, #393939);
    color: var(--cds-inverse-02, #fff);
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10001;
    max-width: 280px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }

  :global(.warning-tooltip-arrow) {
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid var(--cds-inverse-01, #393939);
  }

  :global(.warning-tooltip-item) {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 4px 0;
    color: var(--cds-support-03);
  }

  :global(.warning-tooltip-item span) {
    color: var(--cds-inverse-02, #fff);
    line-height: 1.4;
  }

  :global(.warning-tooltip-item + .warning-tooltip-item) {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin-top: 4px;
  }

  :global(.simple-tooltip) {
    position: fixed;
    transform: translateX(-50%);
    background-color: var(--cds-inverse-01, #393939);
    color: var(--cds-inverse-02, #fff);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 11px;
    z-index: 10001;
    max-width: 220px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    white-space: nowrap;
  }

  :global(.simple-tooltip-arrow) {
    position: absolute;
    top: -5px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 5px solid var(--cds-inverse-01, #393939);
  }
</style>
