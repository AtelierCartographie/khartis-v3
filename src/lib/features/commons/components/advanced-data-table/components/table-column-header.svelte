<script lang="ts">
  import { RefineOperation, type AnalysisResult } from '$lib/features/duckdb';
  import VariableBadge from '$lib/features/commons/components/variable-badge.svelte';
  import type { VariableBadgeType } from '$lib/features/commons/components/variable-badge.types';
  import * as m from '$lib/paraglide/messages';
  import CaretDown from 'carbon-icons-svelte/lib/CaretDown.svelte';
  import CaretUp from 'carbon-icons-svelte/lib/CaretUp.svelte';
  import OverflowMenuVertical from 'carbon-icons-svelte/lib/OverflowMenuVertical.svelte';
  import WarningAlt from 'carbon-icons-svelte/lib/WarningAlt.svelte';
  import { GEOID_SCORE_THRESHOLD } from '../column-type-styles';
  import type { ColumnInfo, ColumnType } from '../types';
  import Portal from './portal.svelte';

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
    { value: 'date', label: m.column_type_date() }
  ];

  const refineOptions: { value: RefineOperation; label: string }[] = [
    {
      value: RefineOperation.UPPERCASE,
      label: m.column_refine_uppercase()
    },
    {
      value: RefineOperation.LOWERCASE,
      label: m.column_refine_lowercase()
    },
    { value: RefineOperation.TRIM, label: m.column_refine_trim() },
    {
      value: RefineOperation.TRIM_ALL,
      label: m.column_refine_trim_all()
    }
  ];

  let activeSubmenu = $state<'type' | 'refine' | null>(null);
  let typeSubmenuTriggerRef = $state<HTMLElement | null>(null);
  let refineSubmenuTriggerRef = $state<HTMLElement | null>(null);
  let submenuPosition = $state({ top: 0, left: 0 });

  interface NumericBin {
    bin: number | null;
    count: number;
  }
  interface CategoryItem {
    category: string | null;
    count: number;
    percent: number;
  }
  interface HistogramLike {
    toArray(): unknown[];
    numRows: number;
  }
  function isHistogramLike(value: unknown): value is HistogramLike {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as HistogramLike).toArray === 'function'
    );
  }

  type HistogramData =
    | {
        kind: 'categorical';
        items: CategoryItem[];
        isAllUnique: boolean;
        uniques: number;
      }
    | {
        kind: 'numeric';
        bins: NumericBin[];
        maxCount: number;
        nullCount: number;
        min: number | Date | undefined;
        max: number | Date | undefined;
        isDate: boolean;
      }
    | {
        kind: 'geographic';
        uniques: number;
        nulls: number;
        duplicates: number;
      };

  const isGeoid = $derived(
    analysis?.semioType === 'geoid' &&
      (analysis?.semioScore ?? 0) >= GEOID_SCORE_THRESHOLD
  );

  const histogramData: HistogramData | null = $derived.by(() => {
    if (!showSummaryPlots || !analysis) return null;

    if (isGeoid) {
      return {
        kind: 'geographic' as const,
        uniques: (analysis.uniques as number) ?? 0,
        nulls: (analysis.nulls as number) ?? 0,
        duplicates: (analysis.duplicates as number) ?? 0
      };
    }

    if (!analysis.histogram || !isHistogramLike(analysis.histogram))
      return null;

    const typeSimple = analysis.type_simple;

    if (typeSimple === 'string') {
      const items = analysis.histogram.toArray() as CategoryItem[];
      const isAllUnique = items.length === 1 && items[0]?.category === 'unique';
      return {
        kind: 'categorical' as const,
        items,
        isAllUnique,
        uniques: (analysis.uniques as number) ?? 0
      };
    }

    if (typeSimple === 'numeric' || typeSimple === 'date') {
      const allBins = analysis.histogram.toArray() as NumericBin[];
      const nullBin = allBins.find((b) => b.bin === null);
      const bins = allBins.filter((b) => b.bin !== null);
      const maxCount = Math.max(...bins.map((b) => b.count), 1);
      return {
        kind: 'numeric' as const,
        bins,
        maxCount,
        nullCount: nullBin?.count ?? (analysis.nulls as number) ?? 0,
        min: analysis.min as number | Date | undefined,
        max: analysis.max as number | Date | undefined,
        isDate: typeSimple === 'date'
      };
    }

    return null;
  });

  const badgeType: VariableBadgeType = $derived.by(() => {
    const isGeoid =
      analysis?.semioType === 'geoid' &&
      (analysis?.semioScore ?? 0) >= GEOID_SCORE_THRESHOLD;
    if (isGeoid) return 'geo-ref';

    const typeSimple = analysis?.type_simple;
    if (typeSimple === 'numeric') return 'numeric';
    if (typeSimple === 'boolean') return 'boolean';
    if (typeSimple === 'date') return 'date';
    return 'string';
  });

  const typeTooltipMessage = $derived.by(() => {
    const typeSimple = analysis?.type_simple;
    if (typeSimple === 'numeric') return m.column_type_numeric_tooltip();
    if (typeSimple === 'boolean') return m.column_type_boolean();
    if (typeSimple === 'date') return m.column_type_date_tooltip();
    if (typeSimple === 'string') return m.column_type_text_tooltip();
    return m.column_type_text_tooltip();
  });

  interface ColumnWarning {
    type: 'nulls' | 'duplicates' | 'low_uniques';
    message: string;
    severity: 'warning' | 'info';
  }

  const columnWarnings = $derived.by((): ColumnWarning[] => {
    if (!analysis) return [];
    const warnings: ColumnWarning[] = [];

    const shareNulls = analysis.share_nulls as number | undefined;
    const nulls = analysis.nulls as number | undefined;

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

    return warnings;
  });

  let menuOpen = $state(false);
  let menuButton = $state<HTMLButtonElement | null>(null);
  let menuPosition = $state({ top: 0, left: 0 });

  let warningTooltipOpen = $state(false);
  let warningBadgeRef = $state<HTMLElement | null>(null);
  let warningTooltipPosition = $state({ top: 0, left: 0 });

  let typeTooltipOpen = $state(false);
  let pillRef = $state<HTMLButtonElement | undefined>(undefined);
  let typeTooltipPosition = $state({ top: 0, left: 0 });

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
    activeSubmenu = null;
  }

  function openSubmenu(
    submenu: 'type' | 'refine',
    trigger: HTMLElement | null
  ) {
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      submenuPosition = { top: rect.top, left: rect.right };
    }

    activeSubmenu = submenu;
  }

  function handleClickOutside(event: MouseEvent) {
    const path = event.composedPath() as Element[];
    if (path.some((el) => el.id === 'khartis-color-picker-dropdown')) return;
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
    if (pillRef) {
      const rect = pillRef.getBoundingClientRect();
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

  $effect(() => {
    if (menuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<th scope="col">
  <div class="col-header">
    <div class="col-title-row">
      <VariableBadge
        label={column.name}
        type={badgeType}
        bind:element={pillRef}
        onmouseenter={showTypeTooltip}
        onmouseleave={hideTypeTooltip}
        onfocus={showTypeTooltip}
        onblur={hideTypeTooltip}
        ariaLabel={m.column_type_badge_label({
          column: column.name,
          type: typeTooltipMessage
        })}
      />
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
              {#each columnWarnings as warning, i (i)}
                <div class="warning-tooltip-item">
                  <WarningAlt size={16} />
                  <span>{warning.message}</span>
                </div>
              {/each}
            </div>
          </Portal>
        {/if}
      {/if}

      {#if isEditMode}
        <div class="col-actions" class:menu-open={menuOpen}>
          <button
            class="menu-trigger"
            bind:this={menuButton}
            onclick={toggleMenu}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label={m.column_menu_options({ column: column.name })}
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
                {#if onChangeType}
                  <button
                    class="menu-item submenu-trigger"
                    bind:this={typeSubmenuTriggerRef}
                    onmouseenter={() =>
                      openSubmenu('type', typeSubmenuTriggerRef)}
                    onfocus={() => openSubmenu('type', typeSubmenuTriggerRef)}
                  >
                    {m.column_type_change()}
                    <span class="submenu-arrow">&#9654;</span>
                  </button>
                {/if}

                <button
                  class="menu-item submenu-trigger"
                  bind:this={refineSubmenuTriggerRef}
                  onmouseenter={() =>
                    openSubmenu('refine', refineSubmenuTriggerRef)}
                  onfocus={() => openSubmenu('refine', refineSubmenuTriggerRef)}
                >
                  {m.column_refine_label()}
                  <span class="submenu-arrow">&#9654;</span>
                </button>

                <div class="menu-divider"></div>

                {#if onRename}
                  <button
                    class="menu-item"
                    onclick={() =>
                      handleMenuAction(() => onRename(column.name))}
                  >
                    {m.column_rename_action()}
                  </button>
                {/if}

                {#if onHide}
                  <button
                    class="menu-item"
                    onclick={() => handleMenuAction(() => onHide(column.name))}
                  >
                    {isHidden ? m.column_show() : m.column_hide()}
                  </button>
                {/if}

                <div class="menu-divider"></div>

                {#if onDelete}
                  <button
                    class="menu-item menu-item-danger"
                    onclick={() =>
                      handleMenuAction(() => onDelete(column.name))}
                  >
                    {m.column_delete_action()}
                  </button>
                {/if}
              </div>
            </Portal>
          {/if}
          {#if activeSubmenu === 'type' && onChangeType}
            <Portal>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="dropdown-menu submenu-portal"
                style="top: {submenuPosition.top}px; left: {submenuPosition.left}px;"
                onmouseenter={() => (activeSubmenu = 'type')}
                onmouseleave={() => (activeSubmenu = null)}
              >
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
            </Portal>
          {/if}
          {#if activeSubmenu === 'refine'}
            <Portal>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="dropdown-menu submenu-portal"
                style="top: {submenuPosition.top}px; left: {submenuPosition.left}px;"
                onmouseenter={() => (activeSubmenu = 'refine')}
                onmouseleave={() => (activeSubmenu = null)}
              >
                {#each refineOptions as option (option.value)}
                  <button
                    class="menu-item"
                    onclick={() =>
                      handleMenuAction(() =>
                        onRefine(column.name, option.value)
                      )}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            </Portal>
          {/if}
        </div>
      {/if}
    </div>
    <div class="sort-row">
      <button
        class="sort-btn"
        class:active={sortColumn === column.name && sortOrder === 'ASC'}
        onclick={() => onSort(column.name, 'ASC')}
        title={m.column_sort_asc()}
      >
        <CaretUp size={16} />
      </button>
      <button
        class="sort-btn"
        class:active={sortColumn === column.name && sortOrder === 'DESC'}
        onclick={() => onSort(column.name, 'DESC')}
        title={m.column_sort_desc()}
      >
        <CaretDown size={16} />
      </button>
    </div>
    {#if showSummaryPlots && analysis}
      <div class="summary-plot-wrapper">
        <div class="summary-plot">
          {#if histogramData?.kind === 'geographic'}
            {#if histogramData.nulls > 0 || histogramData.duplicates > 0}
              <div class="hist-warnings">
                {#if histogramData.nulls > 0}
                  <div class="hist-warning-line">
                    <span class="hist-warning-icon"
                      ><WarningAlt size={14} /></span
                    >
                    <span
                      >{m.column_warning_nulls({
                        count: histogramData.nulls.toLocaleString()
                      })}</span
                    >
                  </div>
                {/if}
                {#if histogramData.duplicates > 0}
                  <div class="hist-warning-line hist-warning-line-plain">
                    <span
                      >{m.column_warning_duplicates({
                        count: histogramData.duplicates.toLocaleString()
                      })}</span
                    >
                  </div>
                {/if}
              </div>
            {:else}
              <div class="hist-unique-bar">
                <span class="hist-unique-text">
                  {m.summary_plot_unique_values({
                    count: histogramData.uniques.toLocaleString()
                  })}
                </span>
              </div>
            {/if}
          {:else if columnWarnings.length > 0 && (!histogramData || (histogramData.kind === 'categorical' && histogramData.isAllUnique))}
            <div class="hist-warnings">
              {#each columnWarnings as warning, index (warning.message + index)}
                <div class="hist-warning-line">
                  <span class="hist-warning-icon"><WarningAlt size={16} /></span
                  >
                  <span>{warning.message}</span>
                </div>
              {/each}
            </div>
          {:else if histogramData?.kind === 'categorical'}
            {#if histogramData.isAllUnique}
              <div class="hist-unique-bar">
                <span class="hist-unique-text">
                  {m.summary_plot_unique_values({
                    count: histogramData.uniques.toLocaleString()
                  })}
                </span>
              </div>
            {:else}
              <div class="hist-cat-bars">
                {#each histogramData.items as item, i (item.category ?? `null-${i}`)}
                  <div
                    class="hist-cat-bar"
                    class:first={i === 0}
                    class:last={i === histogramData.items.length - 1}
                    style="background-color: {item.category === null
                      ? '#ff832b'
                      : '#9f1853'}"
                    title="{item.count?.toLocaleString()} – {item.category ??
                      m.column_null_label()}"
                  >
                    <span class="hist-cat-label">
                      {item.category ?? '⌀'}
                    </span>
                  </div>
                {/each}
              </div>
              <div class="hist-footer">
                {m.summary_plot_categories({
                  count: histogramData.uniques.toLocaleString()
                })}
              </div>
            {/if}
          {:else if histogramData?.kind === 'numeric'}
            <div class="hist-num-area">
              <div class="hist-num-bars">
                {#each histogramData.bins as bin ((bin.bin as unknown) instanceof Date ? (bin.bin as unknown as Date).getTime() : bin.bin)}
                  <div
                    class="hist-num-bar"
                    style="height: {(bin.count / histogramData.maxCount) *
                      100}%"
                    title={bin.count?.toLocaleString()}
                  ></div>
                {/each}
              </div>
              {#if histogramData.nullCount > 0}
                <div class="hist-null-section">
                  <div
                    class="hist-null-bar"
                    style="height: {Math.min(
                      (histogramData.nullCount / histogramData.maxCount) * 100,
                      100
                    )}%"
                    title="{histogramData.nullCount.toLocaleString()} {m.column_null_label()}"
                  ></div>
                </div>
              {/if}
            </div>
            <div class="hist-num-footer">
              <div class="hist-num-labels">
                <span class="hist-num-label">
                  {histogramData.isDate
                    ? ((histogramData.min as Date)?.toLocaleDateString() ?? '')
                    : ((histogramData.min as number)?.toLocaleString() ?? '')}
                </span>
                <span class="hist-num-label">
                  {histogramData.isDate
                    ? ((histogramData.max as Date)?.toLocaleDateString() ?? '')
                    : ((histogramData.max as number)?.toLocaleString() ?? '')}
                </span>
              </div>
              {#if histogramData.nullCount > 0}
                <span class="hist-null-footer-label">⌀</span>
              {/if}
            </div>
          {:else}
            <div class="hist-empty">
              {m.column_unique_count({ count: analysis.uniques ?? 0 })}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</th>

<style>
  th {
    text-align: left;
    vertical-align: top;
    padding: 7px 8px 0;
    border-bottom: 1px solid var(--cds-border-subtle-01, #c6c6c6);
    min-width: 128px;
    background-color: var(--khartis-data-table-header-background);
  }

  th:hover {
    background-color: var(--khartis-data-table-header-hover-background);
  }

  .col-header {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .col-title-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .col-title-row :global(.variable-badge) {
    min-width: 0;
    flex: 1 1 auto;
  }

  .col-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    margin-left: auto;
    opacity: 0;
    transition: opacity 0.1s ease;
  }

  th:hover .col-actions,
  .col-actions.menu-open {
    opacity: 1;
  }

  .menu-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--cds-text-02, #525252);
    cursor: pointer;
    border-radius: 2px;
  }

  .menu-trigger:hover {
    background-color: var(--cds-hover-ui);
    color: var(--cds-text-01, #161616);
  }

  :global(.dropdown-menu) {
    position: fixed;
    transform: translateX(-100%);
    min-width: 180px;
    background-color: var(--cds-ui-01, #f4f4f4);
    border: 1px solid var(--cds-ui-03, #e0e0e0);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    z-index: var(--z-notification);
    max-height: 400px;
    overflow-y: auto;
  }

  :global(.dropdown-menu .menu-item) {
    display: block;
    width: 100%;
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--cds-text-01, #161616);
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
    color: var(--cds-text-04, #fff);
  }

  :global(.dropdown-menu .menu-divider) {
    height: 1px;
    background-color: var(--cds-ui-03, #e0e0e0);
    margin: 4px 0;
  }

  :global(.dropdown-menu .menu-label) {
    display: block;
    padding: 8px 16px 4px;
    font-size: 12px;
    color: var(--cds-text-02, #525252);
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
    color: var(--cds-text-02, #525252);
  }

  :global(.submenu-portal) {
    transform: none;
    min-width: 140px;
  }

  .sort-row {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 0;
    margin-top: 2px;
    margin-bottom: 0;
  }

  .sort-btn {
    border: none;
    background: none;
    padding: 4px;
    margin: 0;
    color: var(--cds-text-03, #8d8d8d);
    cursor: pointer;
    line-height: 0;
    opacity: 0.35;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
  }

  .sort-btn:hover {
    opacity: 0.8;
    color: var(--cds-text-01, #161616);
  }

  .sort-btn.active {
    color: var(--cds-text-inverse, #ffffff);
    background-color: var(--cds-interactive-01, #0f62fe);
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.85);
    opacity: 1;
  }

  .sort-btn.active:hover {
    color: var(--cds-text-inverse, #ffffff);
    background-color: var(--cds-hover-primary, #0353e9);
  }

  .summary-plot-wrapper {
    margin: 0 -8px;
    padding: 13px 8px 12px;
    background-color: var(--khartis-data-table-header-background);
  }

  .summary-plot {
    height: 38px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .hist-unique-bar {
    flex: 1;
    background-color: #005d5d;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    min-height: 20px;
  }

  .hist-unique-text {
    color: #ffffff;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.32px;
    line-height: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hist-cat-bars {
    flex: 1;
    display: flex;
    gap: 1px;
    align-items: stretch;
    padding: 0 2px;
    min-height: 0;
  }

  .hist-cat-bar {
    flex: 1 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 0;
    padding: 2px 2px;
  }

  .hist-cat-bar.first {
    border-radius: 4px 0 0 4px;
  }

  .hist-cat-bar.last {
    border-radius: 0 4px 4px 0;
  }

  .hist-cat-bar.first.last {
    border-radius: 4px;
  }

  .hist-cat-label {
    color: #ffffff;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    letter-spacing: 0.32px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hist-footer {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 11px;
    color: var(--cds-text-02, #525252);
    line-height: 14px;
    letter-spacing: 0.32px;
    flex-shrink: 0;
  }

  .hist-num-area {
    flex: 1;
    display: flex;
    gap: 4px;
    min-height: 0;
  }

  .hist-num-bars {
    flex: 1;
    display: flex;
    align-items: flex-end;
    gap: 1px;
    padding: 0 2px;
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
  }

  .hist-num-bar {
    flex: 1 0 0;
    background-color: #6929c4;
    min-width: 0;
    min-height: 1px;
  }

  .hist-null-section {
    display: flex;
    align-items: flex-end;
    width: 12px;
    flex-shrink: 0;
    padding: 0 2px;
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
  }

  .hist-null-bar {
    width: 100%;
    background-color: #ff832b;
    min-height: 1px;
  }

  .hist-num-footer {
    display: flex;
    gap: 4px;
    padding-top: 0;
    flex-shrink: 0;
  }

  .hist-num-labels {
    flex: 1;
    display: flex;
    justify-content: space-between;
    min-width: 0;
  }

  .hist-num-label {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    line-height: 14px;
    letter-spacing: 0.32px;
    color: var(--cds-text-02, #525252);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hist-null-footer-label {
    width: 12px;
    text-align: center;
    font-size: 11px;
    line-height: 14px;
    color: #ff832b;
    flex-shrink: 0;
  }

  .hist-warnings {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-height: 0;
  }

  .hist-warning-line {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #ff832b;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    white-space: nowrap;
    overflow: hidden;
  }

  .hist-warning-line-plain {
    gap: 0;
  }

  .hist-warning-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    transform: scale(0.75);
    transform-origin: center;
  }

  .hist-warning-line span {
    color: #ff832b;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hist-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    line-height: 16px;
    color: var(--cds-text-02, #525252);
  }

  .warning-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ff832b;
    cursor: pointer;
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 1px;
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
    z-index: var(--z-popover);
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
    color: #ff832b;
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
    z-index: var(--z-popover);
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
