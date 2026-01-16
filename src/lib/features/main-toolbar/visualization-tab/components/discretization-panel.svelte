<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import {
    Column,
    Grid,
    Row,
    Select,
    SelectItem,
    TextInput,
    Toggle
  } from 'carbon-components-svelte';
  import { Information, Edit } from 'carbon-icons-svelte';

  type ClassificationMethod =
    | 'jenks'
    | 'quantile'
    | 'equal-interval'
    | 'stddev'
    | 'manual';

  interface ClassBreak {
    min: number;
    max: number;
    count: number;
    color: string;
  }

  interface Props {
    method?: ClassificationMethod;
    numClasses?: number;
    breaks?: ClassBreak[];
    breakpointValue?: number | null;
    showHistogram?: boolean;
    onmethodchange?: (method: ClassificationMethod) => void;
    onclasseschange?: (num: number) => void;
    onbreakpointchange?: (value: number | null) => void;
    onbreakschange?: (breaks: ClassBreak[]) => void;
  }

  let {
    method = $bindable<ClassificationMethod>('quantile'),
    numClasses = $bindable(5),
    breaks = $bindable<ClassBreak[]>([
      { min: 0, max: 20, count: 45, color: '#f7fbff' },
      { min: 20, max: 40, count: 72, color: '#c6dbef' },
      { min: 40, max: 60, count: 98, color: '#6baed6' },
      { min: 60, max: 80, count: 56, color: '#2171b5' },
      { min: 80, max: 100, count: 29, color: '#08519c' }
    ]),
    breakpointValue = $bindable<number | null>(null),
    showHistogram = true,
    onmethodchange,
    onclasseschange,
    onbreakpointchange,
    onbreakschange
  }: Props = $props();

  let useDivergent = $state(false);
  let editingBreakIndex = $state<number | null>(null);

  function getMethodDescription(method: ClassificationMethod): string {
    const descriptions: Record<ClassificationMethod, () => string> = {
      jenks: m.discretization_desc_jenks,
      quantile: m.discretization_desc_quantile,
      'equal-interval': m.discretization_desc_equal_interval,
      stddev: m.discretization_desc_stddev,
      manual: m.discretization_desc_manual
    };
    return descriptions[method]();
  }

  const maxHistogramHeight = $derived.by(() => {
    const maxCount = Math.max(...breaks.map((b) => b.count));
    return maxCount;
  });

  function handleMethodChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const newMethod = target.value as ClassificationMethod;
    method = newMethod;
    onmethodchange?.(newMethod);
  }

  function handleClassesChange() {
    onclasseschange?.(numClasses);
  }

  function toggleDivergent() {
    if (useDivergent) {
      breakpointValue = null;
      onbreakpointchange?.(null);
    } else {
      breakpointValue = 50;
      onbreakpointchange?.(50);
    }
  }

  function startEditingBreak(index: number) {
    editingBreakIndex = index;
  }

  function finishEditingBreak() {
    editingBreakIndex = null;
    onbreakschange?.(breaks);
  }

  function updateBreakValue(
    index: number,
    field: 'min' | 'max',
    value: number
  ) {
    breaks[index][field] = value;
  }
</script>

<div class="discretization-panel">
  <div class="section">
    <Grid padding noGutter>
      <Row>
        <Column sm={4} md={4} lg={8}>
          <Select
            id="classification-method"
            labelText={m.discretization()}
            value={method}
            on:change={handleMethodChange}
          >
            <SelectItem value="jenks" text={m.discretization_method_jenks()} />
            <SelectItem
              value="quantile"
              text={m.discretization_method_quantile()}
            />
            <SelectItem
              value="equal-interval"
              text={m.discretization_method_equal_interval()}
            />
            <SelectItem
              value="stddev"
              text={m.discretization_method_stddev()}
            />
            <SelectItem
              value="manual"
              text={m.discretization_method_manual()}
            />
          </Select>
        </Column>
        <Column sm={4} md={4} lg={8}>
          <div class="labeled-input">
            <label for="num-classes" class="input-label"
              >{m.discretization_num_classes()}</label
            >
            <CompactNumberInput
              bind:value={numClasses}
              min={2}
              max={12}
              onchange={handleClassesChange}
              width="100%"
            />
          </div>
        </Column>
      </Row>
    </Grid>
  </div>

  <div class="section info-section">
    <div class="method-info">
      <Information size={20} />
      <span class="method-description">{getMethodDescription(method)}</span>
    </div>
  </div>

  <div class="section divergent-section">
    <Toggle
      id="divergent-toggle"
      labelText={m.discretization_divergent_palette()}
      labelA={m.no()}
      labelB={m.yes()}
      bind:toggled={useDivergent}
      on:toggle={toggleDivergent}
    />

    {#if useDivergent}
      <div class="breakpoint-input">
        <div class="labeled-input">
          <label for="breakpoint-value" class="input-label"
            >{m.discretization_breakpoint_value()}</label
          >
          <CompactNumberInput
            bind:value={breakpointValue}
            onchange={(v) => onbreakpointchange?.(v)}
            width="100%"
          />
        </div>
      </div>
    {/if}
  </div>

  {#if showHistogram}
    <div class="section histogram-section">
      <h6 class="label">{m.discretization_histogram()}</h6>
      <div class="histogram-container">
        <div class="histogram">
          {#each breaks as breakItem, index (index)}
            {@const heightPercent =
              (breakItem.count / maxHistogramHeight) * 100}
            <div class="histogram-bar-container">
              <div
                class="histogram-bar"
                style="--height: {heightPercent}%; --color: {breakItem.color}"
                title="{breakItem.min} - {breakItem.max}: {breakItem.count} {m.discretization_values()}"
              ></div>
              <span class="bar-count">{breakItem.count}</span>
            </div>
          {/each}
        </div>
        <div class="histogram-axis">
          {#each breaks as breakItem, index (index)}
            <span class="axis-label">{breakItem.min}</span>
          {/each}
          <span class="axis-label">{breaks[breaks.length - 1]?.max}</span>
        </div>
      </div>
    </div>
  {/if}

  <div class="section breaks-section">
    <h6 class="label">
      {m.discretization_class_bounds()}
      {#if method !== 'manual'}
        <span class="label-hint">{m.discretization_click_to_edit()}</span>
      {/if}
    </h6>
    <div class="breaks-list">
      {#each breaks as breakItem, index (index)}
        <div class="break-row" class:editing={editingBreakIndex === index}>
          <div class="break-color" style="--color: {breakItem.color}"></div>

          {#if editingBreakIndex === index || method === 'manual'}
            <div class="break-inputs">
              <TextInput
                id="break-min-{index}"
                size="sm"
                hideLabel
                labelText="Min"
                value={String(breakItem.min)}
                on:input={(e) => {
                  const target = e.target as HTMLInputElement;
                  updateBreakValue(index, 'min', parseFloat(target.value) || 0);
                }}
                on:blur={finishEditingBreak}
              />
              <span class="break-separator">—</span>
              <TextInput
                id="break-max-{index}"
                size="sm"
                hideLabel
                labelText="Max"
                value={String(breakItem.max)}
                on:input={(e) => {
                  const target = e.target as HTMLInputElement;
                  updateBreakValue(index, 'max', parseFloat(target.value) || 0);
                }}
                on:blur={finishEditingBreak}
              />
            </div>
          {:else}
            <button
              type="button"
              class="break-values"
              onclick={() => startEditingBreak(index)}
              aria-label={m.discretization_edit_bounds()}
            >
              <span>{breakItem.min}</span>
              <span class="break-separator">—</span>
              <span>{breakItem.max}</span>
              <Edit size={16} class="edit-icon" />
            </button>
          {/if}

          <span class="break-count">{breakItem.count}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style lang="scss">
  .discretization-panel {
    padding: var(--cds-spacing-03);
  }

  .section {
    margin-bottom: var(--cds-spacing-05);
  }

  .labeled-input {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .input-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-03);
    text-transform: uppercase;
    letter-spacing: 0.32px;
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .label-hint {
    font-weight: 400;
    text-transform: none;
    font-size: 0.75rem;
    color: var(--cds-text-helper);
  }

  .info-section {
    padding: var(--cds-spacing-03) 0;
  }

  .method-info {
    display: flex;
    align-items: flex-start;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
    background-color: var(--cds-layer);
    border-left: 3px solid var(--cds-support-info);
    border-radius: 0 4px 4px 0;
  }

  .method-description {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    line-height: 1.4;
  }

  .divergent-section {
    padding: var(--cds-spacing-03) 0;
    border-top: 1px solid var(--cds-border-subtle);
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .breakpoint-input {
    margin-top: var(--cds-spacing-04);
  }

  .histogram-section {
    padding-top: var(--cds-spacing-04);
  }

  .histogram-container {
    background-color: var(--cds-layer);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    padding: var(--cds-spacing-04);
  }

  .histogram {
    display: flex;
    align-items: flex-end;
    height: 100px;
    gap: 2px;
    margin-bottom: var(--cds-spacing-02);
  }

  .histogram-bar-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
  }

  .histogram-bar {
    width: 100%;
    height: var(--height);
    background-color: var(--color);
    border-radius: 2px 2px 0 0;
    min-height: 4px;
    transition: height 0.3s ease;
  }

  .bar-count {
    font-size: 0.625rem;
    color: var(--cds-text-02);
    margin-top: 2px;
  }

  .histogram-axis {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid var(--cds-border-subtle);
    padding-top: var(--cds-spacing-02);
  }

  .axis-label {
    font-size: 0.625rem;
    color: var(--cds-text-02);
  }

  .breaks-section {
    padding-top: var(--cds-spacing-04);
  }

  .breaks-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .break-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-02);
    background-color: var(--cds-layer);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    transition: background-color 0.15s ease;

    &:hover {
      background-color: var(--cds-layer-hover);
    }

    &.editing {
      border-color: var(--cds-interactive);
    }
  }

  .break-color {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    background-color: var(--color);
    border: 1px solid var(--cds-border-subtle);
    flex-shrink: 0;
  }

  .break-values {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    flex: 1;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: var(--cds-spacing-02);
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    transition: background-color 0.15s ease;

    &:hover {
      background-color: var(--cds-layer-hover);

      :global(.edit-icon) {
        opacity: 1;
      }
    }

    :global(.edit-icon) {
      opacity: 0;
      color: var(--cds-text-02);
      transition: opacity 0.15s ease;
    }
  }

  .break-inputs {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    flex: 1;

    :global(.bx--text-input) {
      width: 60px;
    }
  }

  .break-separator {
    color: var(--cds-text-02);
  }

  .break-count {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    min-width: 40px;
    text-align: right;
  }
</style>
