<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import { EVENT, KEY } from '$lib/features/commons/constants/dom.constants';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { ColumnType } from '$lib/features/data-pipeline';
  import type {
    VizDataFilter,
    VizFilterOperator
  } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Dropdown, TextInput } from 'carbon-components-svelte';
  import { Add, Close, Launch, TrashCan } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';

  interface DataFieldOption {
    id: number;
    text: string;
    type?: string;
  }

  interface Props {
    title?: string;
    dataFields: DataFieldOption[];
    filters: VizDataFilter[];
    stats: { total: number; filtered: number };
    onAddFilter: (filter: Omit<VizDataFilter, 'id'>) => void;
    onUpdateFilter: (
      filterId: string,
      updates: Partial<Omit<VizDataFilter, 'id'>>
    ) => void;
    onRemoveFilter: (filterId: string) => void;
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
    onClose
  }: Props = $props();

  const MAIN_TOOLBAR_ID = 'khartis-main-toolbar';

  function getFallbackPanelRight(toolbarState: ToolbarState): string {
    switch (toolbarState) {
      case ToolbarState.Collapsed:
        return '50px';
      case ToolbarState.Compact:
        return '434px';
      default:
        return 'clamp(400px, 50vw, 800px)';
    }
  }

  function readPanelRight(): string {
    if (typeof window === 'undefined') {
      return getFallbackPanelRight(globalState.toolbarState);
    }
    const toolbar = document.getElementById(MAIN_TOOLBAR_ID);
    if (!toolbar) {
      return getFallbackPanelRight(globalState.toolbarState);
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

  onMount(() => {
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

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE) onClose();
    }

    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener(EVENT.RESIZE, updatePanelPosition);
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
    };
  });

  interface OperatorDef {
    value: VizFilterOperator;
    label: string;
    requiresValue?: boolean;
    requiresRange?: boolean;
    requiresLimit?: boolean;
    allowedTypes?: ColumnType[];
  }

  const operators: OperatorDef[] = [
    {
      value: 'gte',
      label: m.filter_op_gte(),
      requiresValue: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    {
      value: 'lte',
      label: m.filter_op_lte(),
      requiresValue: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    {
      value: 'contains',
      label: m.filter_op_contains(),
      requiresValue: true,
      allowedTypes: [ColumnType.TEXT]
    },
    { value: 'equals', label: m.filter_op_equals(), requiresValue: true },
    {
      value: 'not_equals',
      label: m.filter_op_not_equals(),
      requiresValue: true
    },
    {
      value: 'between',
      label: m.filter_op_between(),
      requiresRange: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    {
      value: 'top_asc',
      label: m.filter_op_top_asc(),
      requiresLimit: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    {
      value: 'top_desc',
      label: m.filter_op_top_desc(),
      requiresLimit: true,
      allowedTypes: [ColumnType.NUMBER, ColumnType.DATE]
    },
    { value: 'empty', label: m.filter_op_empty() },
    { value: 'not_empty', label: m.filter_op_not_empty() }
  ];

  function normalizeType(rawType: string | undefined): ColumnType | null {
    if (!rawType) return null;
    const normalized = rawType.toLowerCase();
    if (normalized === ColumnType.NUMBER) return ColumnType.NUMBER;
    if (normalized === ColumnType.TEXT) return ColumnType.TEXT;
    if (normalized === ColumnType.DATE) return ColumnType.DATE;
    if (normalized === ColumnType.BOOLEAN) return ColumnType.BOOLEAN;
    if (
      normalized.includes('int') ||
      normalized.includes('double') ||
      normalized.includes('float') ||
      normalized.includes('numeric') ||
      normalized.includes('decimal')
    ) {
      return ColumnType.NUMBER;
    }
    if (
      normalized.includes('string') ||
      normalized.includes('varchar') ||
      normalized === 'text'
    ) {
      return ColumnType.TEXT;
    }
    if (normalized.includes('date') || normalized.includes('time')) {
      return ColumnType.DATE;
    }
    if (normalized.includes('bool')) {
      return ColumnType.BOOLEAN;
    }
    return null;
  }

  function getColumnType(columnName: string): ColumnType | null {
    const field = dataFields.find((f) => f.text === columnName);
    return normalizeType(field?.type);
  }

  function getAvailableOperators(columnName: string): OperatorDef[] {
    const type = getColumnType(columnName);
    if (!type) return operators;
    return operators.filter(
      (op) => !op.allowedTypes || op.allowedTypes.includes(type)
    );
  }

  function getOperatorDef(
    operatorValue: VizFilterOperator
  ): OperatorDef | undefined {
    return operators.find((op) => op.value === operatorValue);
  }

  function defaultOperatorForColumn(columnName: string): VizFilterOperator {
    const type = getColumnType(columnName);
    if (type === ColumnType.TEXT) return 'contains';
    return 'gte';
  }

  function handleAddFilterClick(): void {
    if (dataFields.length === 0) return;
    const firstColumn = dataFields[0].text;
    const defaultOp = defaultOperatorForColumn(firstColumn);
    const opDef = getOperatorDef(defaultOp);
    onAddFilter({
      column: firstColumn,
      operator: defaultOp,
      value: opDef?.requiresLimit ? '5' : '',
      limit: opDef?.requiresLimit ? 5 : undefined
    });
  }

  function handleColumnChange(filter: VizDataFilter, newColumn: string): void {
    if (newColumn === filter.column) return;
    const oldType = getColumnType(filter.column);
    const newType = getColumnType(newColumn);
    const needsOperatorReset = oldType !== newType;
    const updates: Partial<Omit<VizDataFilter, 'id'>> = { column: newColumn };
    if (needsOperatorReset) {
      const nextOp = defaultOperatorForColumn(newColumn);
      updates.operator = nextOp;
      updates.value = '';
      updates.secondaryValue = undefined;
      updates.limit = getOperatorDef(nextOp)?.requiresLimit ? 5 : undefined;
    }
    onUpdateFilter(filter.id, updates);
  }

  function handleOperatorChange(
    filter: VizDataFilter,
    newOperator: VizFilterOperator
  ): void {
    if (newOperator === filter.operator) return;
    const opDef = getOperatorDef(newOperator);
    const updates: Partial<Omit<VizDataFilter, 'id'>> = {
      operator: newOperator
    };
    if (opDef?.requiresLimit) {
      updates.limit = filter.limit ?? 5;
      updates.value = String(updates.limit);
      updates.secondaryValue = undefined;
    } else if (opDef?.requiresRange) {
      updates.limit = undefined;
    } else if (!opDef?.requiresValue) {
      updates.value = '';
      updates.secondaryValue = undefined;
      updates.limit = undefined;
    } else {
      updates.limit = undefined;
      updates.secondaryValue = undefined;
    }
    onUpdateFilter(filter.id, updates);
  }

  function handleValueChange(filter: VizDataFilter, newValue: string): void {
    onUpdateFilter(filter.id, { value: newValue });
  }

  function handleSecondaryValueChange(
    filter: VizDataFilter,
    newValue: string
  ): void {
    onUpdateFilter(filter.id, { secondaryValue: newValue });
  }

  function handleLimitChange(filter: VizDataFilter, newLimit: number): void {
    onUpdateFilter(filter.id, { limit: newLimit, value: String(newLimit) });
  }

  const percent = $derived.by(() => {
    if (stats.total === 0) return 0;
    return Math.round((stats.filtered / stats.total) * 1000) / 10;
  });

  const progressRatio = $derived.by(() => {
    if (stats.total === 0) return 0;
    return Math.min(1, Math.max(0, stats.filtered / stats.total));
  });

  const dataFieldsDropdownItems = $derived(
    dataFields.map((f) => ({ id: String(f.id), text: f.text, type: f.type }))
  );

  const hasFilters = $derived(filters.length > 0);

  function formatFilteredCount(value: number): string {
    return new Intl.NumberFormat().format(value);
  }
</script>

<aside
  class="viz-filter-panel"
  style:right={panelRight}
  in:fly={{ x: 20, duration: 200 }}
  out:fly={{ x: 20, duration: 150 }}
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
    {#if hasFilters}
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
            percent: String(percent).replace('.', ',')
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

    <a
      class="learn-more-link"
      href="https://khartis.sciencespo.fr/faq"
      target="_blank"
      rel="noopener noreferrer"
    >
      {m.filter_learn_more()}
      <Launch size={12} />
    </a>

    {#each filters as filter, index (filter.id)}
      {@const availOps = getAvailableOperators(filter.column)}
      {@const opDef = getOperatorDef(filter.operator)}
      <article class="filter-card">
        <header class="filter-card-header">
          <span class="filter-card-title">
            {m.filter_card_label({ index: index + 1 })}
          </span>
          <div class="filter-card-divider"></div>
          <IconButton
            kind="ghost"
            size="small"
            icon={TrashCan}
            iconDescription={m.filter_remove()}
            on:click={() => onRemoveFilter(filter.id)}
          />
        </header>

        <div class="filter-field">
          <Dropdown
            size="sm"
            titleText={m.filter_variable()}
            items={dataFieldsDropdownItems}
            selectedId={String(
              dataFields.find((f) => f.text === filter.column)?.id ?? ''
            )}
            on:select={(e) => {
              const id = e.detail.selectedId;
              const field = dataFields.find((f) => String(f.id) === id);
              if (field) handleColumnChange(filter, field.text);
            }}
            type="default"
          />
        </div>

        <div class="filter-field">
          <Dropdown
            size="sm"
            titleText={m.filter_operator()}
            items={availOps.map((op) => ({ id: op.value, text: op.label }))}
            selectedId={filter.operator}
            on:select={(e) =>
              handleOperatorChange(
                filter,
                e.detail.selectedId as VizFilterOperator
              )}
            type="default"
          />
        </div>

        {#if opDef?.requiresRange}
          <div class="filter-field">
            <TextInput
              size="sm"
              labelText={m.filter_value_min()}
              placeholder={m.filter_placeholder_min()}
              value={filter.value ?? ''}
              on:input={(e) =>
                handleValueChange(filter, (e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="filter-field">
            <TextInput
              size="sm"
              labelText={m.filter_value_max()}
              placeholder={m.filter_placeholder_max()}
              value={filter.secondaryValue ?? ''}
              on:input={(e) =>
                handleSecondaryValueChange(
                  filter,
                  (e.target as HTMLInputElement).value
                )}
            />
          </div>
        {:else if opDef?.requiresLimit}
          <div class="filter-field">
            <label class="filter-field-label" for="filter-limit-{filter.id}">
              {m.filter_count()}
            </label>
            <CompactNumberInput
              id="filter-limit-{filter.id}"
              value={filter.limit ?? 5}
              min={1}
              max={1000}
              width="100%"
              onchange={(val) => handleLimitChange(filter, val)}
            />
          </div>
        {:else if opDef?.requiresValue}
          <div class="filter-field">
            {#if getColumnType(filter.column) === ColumnType.NUMBER}
              <label class="filter-field-label" for="filter-value-{filter.id}">
                {m.filter_value()}
              </label>
              <CompactNumberInput
                id="filter-value-{filter.id}"
                value={Number(filter.value) || 0}
                min={Number.MIN_SAFE_INTEGER}
                max={Number.MAX_SAFE_INTEGER}
                width="100%"
                onchange={(val) => handleValueChange(filter, String(val))}
              />
            {:else}
              <TextInput
                size="sm"
                labelText={m.filter_value()}
                placeholder={m.filter_value()}
                value={filter.value ?? ''}
                on:input={(e) =>
                  handleValueChange(
                    filter,
                    (e.target as HTMLInputElement).value
                  )}
              />
            {/if}
          </div>
        {/if}
      </article>
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
    max-height: calc(100dvh - 120px);
    overflow-y: auto;
    background: var(--cds-ui-02, #ffffff);
    border: 1px solid var(--cds-border-subtle, #e0e0e0);
    z-index: var(--z-dropdown);
    display: flex;
    flex-direction: column;
    transition: right 0.2s ease-out;
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
    background: var(--cds-button-primary, #161616);
    color: var(--cds-text-on-color, #ffffff);
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 400;
    width: 100%;

    &:hover:not(:disabled) {
      background: var(--cds-button-primary-hover, #2e2e2e);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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
  }

  .filter-card {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-03);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .filter-card-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .filter-card-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    white-space: nowrap;
  }

  .filter-card-divider {
    flex: 1;
    height: 1px;
    background: var(--cds-border-subtle);
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .filter-field-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
  }

  :global(.viz-filter-panel .bx--dropdown) {
    max-width: 100%;
  }
</style>
