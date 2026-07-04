<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { EVENT, KEY } from '$lib/features/commons/constants/dom.constants';
  import { portal } from '$lib/features/commons/utils/portal';
  import { resolveLocale } from '$lib/features/commons/utils/format.utils';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import {
    MAIN_TOOLBAR_ID,
    resolveToolbarPanelWidth
  } from '$lib/features/commons/utils/toolbar-width.utils';
  import type { VizDataFilter } from '$lib/features/commons/stores/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Add, Close, Launch } from 'carbon-icons-svelte';
  import { untrack } from 'svelte';
  import FilterCard from './filter-card.svelte';
  import {
    DEFAULT_FILTER_LIMIT,
    getFilterColumnType,
    getOperatorDef,
    defaultOperatorForType
  } from './filter-operators.utils';

  interface DataFieldOption {
    id: number;
    text: string;
    type?: string;
  }

  interface Props {
    title?: string;
    dataFields: DataFieldOption[];
    filters: VizDataFilter[];
    stats?: { total: number; filtered: number };
    onAddFilter: (filter: Omit<VizDataFilter, 'id'>) => void;
    onUpdateFilter?: (
      filterId: string,
      updates: Partial<Omit<VizDataFilter, 'id'>>
    ) => void;
    onRemoveFilter: (filterId: string) => void;
    onClearFilters?: () => void;
    onClose: () => void;
  }

  let {
    title,
    dataFields,
    filters,
    stats,
    onAddFilter,
    onUpdateFilter,
    onRemoveFilter,
    onClearFilters,
    onClose
  }: Props = $props();

  function getFallbackPanelRight(): string {
    return resolveToolbarPanelWidth(globalState.toolbarState);
  }

  function readPanelRight(): string {
    if (typeof window === 'undefined') {
      return getFallbackPanelRight();
    }
    const toolbar = document.getElementById(MAIN_TOOLBAR_ID);
    if (!toolbar) {
      return getFallbackPanelRight();
    }
    const toolbarRect = toolbar.getBoundingClientRect();
    const rightOffset = Math.max(0, window.innerWidth - toolbarRect.left);
    return `${Math.round(rightOffset)}px`;
  }

  let panelRight = $state(readPanelRight());

  function updatePanelPosition(): void {
    panelRight = readPanelRight();
  }

  $effect(() => {
    void globalState.toolbarState;
    updatePanelPosition();
  });

  $effect(() => {
    if (typeof window === 'undefined') return;

    updatePanelPosition();
    const toolbar = document.getElementById(MAIN_TOOLBAR_ID);
    const resizeObserver =
      toolbar && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updatePanelPosition())
        : null;
    if (toolbar && resizeObserver) {
      resizeObserver.observe(toolbar);
    }
    window.addEventListener(EVENT.RESIZE, updatePanelPosition);

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === KEY.ESCAPE) untrack(() => onClose)();
    };

    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener(EVENT.RESIZE, updatePanelPosition);
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
    };
  });

  function handleAddFilterClick(): void {
    if (dataFields.length === 0) return;
    const firstColumn = dataFields[0].text;
    const type = getFilterColumnType(dataFields, firstColumn);
    const defaultOp = defaultOperatorForType(type);
    const opDef = getOperatorDef(defaultOp);
    onAddFilter({
      column: firstColumn,
      operator: defaultOp,
      value: opDef?.requiresLimit ? String(DEFAULT_FILTER_LIMIT) : '',
      limit: opDef?.requiresLimit ? DEFAULT_FILTER_LIMIT : undefined
    });
  }

  const percent = $derived.by(() => {
    if (!stats || stats.total === 0) return 0;
    return Math.round((stats.filtered / stats.total) * 1000) / 10;
  });

  const progressRatio = $derived.by(() => {
    if (!stats || stats.total === 0) return 0;
    return Math.min(1, Math.max(0, stats.filtered / stats.total));
  });

  const dataFieldsDropdownItems = $derived(
    dataFields.map((f) => ({ id: String(f.id), text: f.text, type: f.type }))
  );

  const hasFilters = $derived(filters.length > 0);
  const numberLocale = $derived(resolveLocale());

  function formatFilteredCount(value: number): string {
    return new Intl.NumberFormat(numberLocale).format(value);
  }

  function formatFilteredPercent(value: number): string {
    return new Intl.NumberFormat(numberLocale, {
      maximumFractionDigits: 1
    }).format(value);
  }
</script>

<aside
  use:portal
  class="viz-filter-panel"
  style:right={panelRight}
  aria-label={title ?? m.filter_panel_title()}
>
  <header class="panel-header">
    <h3>{m.filter_panel_title()}</h3>
    <IconButton
      kind="ghost"
      size="small"
      icon={Close}
      iconDescription={m.data_tool_close()}
      on:click={onClose}
    />
  </header>

  <div class="panel-content">
    {#if hasFilters && stats && stats.total > 0}
      <div class="stats-block">
        <span class="stats-primary">
          {m.filter_stats_filtered({
            count: formatFilteredCount(stats.filtered)
          })}
        </span>
        <div
          class="stats-progress"
          role="progressbar"
          aria-valuenow={stats.filtered}
          aria-valuemin={0}
          aria-valuemax={stats.total}
        >
          <span class="stats-progress-fill" style:width="{progressRatio * 100}%"
          ></span>
        </div>
        <span class="stats-secondary">
          {m.filter_stats_total({
            total: formatFilteredCount(stats.total),
            percent: formatFilteredPercent(percent)
          })}
        </span>
      </div>
    {/if}

    <button
      type="button"
      class="add-button"
      onclick={handleAddFilterClick}
      disabled={dataFields.length === 0}
    >
      <span>{m.filter_add_filter()}</span>
      <Add size={16} />
    </button>

    {#if hasFilters && onClearFilters}
      <button type="button" class="clear-button" onclick={onClearFilters}>
        {m.filter_clear_all()}
      </button>
    {/if}

    <a
      class="learn-more-link"
      href="https://www.sciencespo.fr/cartographie/khartis/docs/FAQ/"
      target="_blank"
      rel="noopener noreferrer"
    >
      {m.filter_learn_more()}
      <Launch size={12} />
    </a>

    {#each filters as filter, index (filter.id)}
      <FilterCard
        filter={filter}
        index={index}
        dataFields={dataFields}
        dataFieldsDropdownItems={dataFieldsDropdownItems}
        onRemoveFilter={onRemoveFilter}
        onUpdateFilter={onUpdateFilter}
      />
    {/each}
  </div>
</aside>

<style lang="scss">
  .viz-filter-panel {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 300px;
    min-height: 300px;
    max-height: calc(100dvh - 120px);
    overflow-y: auto;
    background: var(--cds-ui-02, #ffffff);
    border: 1px solid var(--cds-border-subtle, #e0e0e0);
    z-index: var(--z-dropdown);
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 1023px) {
    .viz-filter-panel {
      right: 0 !important;
      left: 0;
      top: auto;
      bottom: calc(
        60px + env(safe-area-inset-bottom, 0px) + var(--cds-spacing-03) + 48px +
          var(--cds-spacing-03)
      );
      transform: none;
      width: 100vw;
      max-height: calc(
        100dvh - var(--cds-header-height, 48px) -
          60px - env(safe-area-inset-bottom, 0px) - var(--cds-spacing-03) -
          48px - var(--cds-spacing-03) - var(--cds-spacing-05)
      );
      z-index: calc(var(--z-mobile-toolbar) + 2);
      border-radius: 8px 8px 0 0;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
    }
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-04);
    border-bottom: 1px solid var(--cds-border-subtle);
    position: sticky;
    top: 0;
    background: var(--cds-ui-02);
    z-index: 1;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .panel-content {
    padding: var(--cds-spacing-04);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .stats-block {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .stats-primary {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
  }

  .stats-progress {
    height: 4px;
    background: var(--cds-layer-accent-01, #e0e0e0);
    border-radius: 2px;
    overflow: hidden;
  }

  .stats-progress-fill {
    display: block;
    height: 100%;
    background: var(--cds-interactive-01, #161616);
    transition: width 0.15s ease-out;
  }

  .stats-secondary {
    font-size: 0.75rem;
    color: var(--cds-text-secondary, #525252);
  }

  .add-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--cds-spacing-04) var(--cds-spacing-05);
    background: var(--cds-layer-inverse, #393939);
    color: var(--cds-text-inverse, #ffffff);
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 400;
    width: 100%;
    transition: background 0.1s ease;

    &:hover:not(:disabled) {
      background: var(--cds-layer-inverse-hover, #474747);
    }

    &:active:not(:disabled) {
      background: var(--cds-layer-inverse-active, #6f6f6f);
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus);
      outline-offset: -2px;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .clear-button {
    align-self: flex-start;
    background: transparent;
    border: none;
    color: var(--cds-link-01, #0f62fe);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus);
      outline-offset: 2px;
    }
  }

  .learn-more-link {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--cds-link-01, #0f62fe);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus);
      outline-offset: 2px;
    }
  }

  :global(.viz-filter-panel .bx--dropdown) {
    max-width: 100%;
  }
</style>
