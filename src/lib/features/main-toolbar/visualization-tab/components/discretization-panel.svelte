<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import {
    DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
    NESTED_MEANS_CLASS_COUNTS
  } from './discretization.utils';
  import {
    Button,
    Select,
    SelectItem,
    Slider,
    TextInput
  } from 'carbon-components-svelte';
  import { CaretRight, Edit, Information, Launch } from 'carbon-icons-svelte';

  type ClassificationMethod =
    | 'jenks'
    | 'quantile'
    | 'equal-interval'
    | 'manual'
    | 'q6'
    | 'nested-means'
    | 'head-tail';

  interface ClassBreak {
    min: number;
    max: number;
    count: number;
    color: string;
  }

  interface Props {
    method?: ClassificationMethod;
    numClasses?: number;
    classCountMax?: number;
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
    classCountMax = DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
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

  let editingBreakIndex = $state<number | null>(null);

  function getMethodDescription(m_: ClassificationMethod): string {
    const descriptions: Record<ClassificationMethod, () => string> = {
      jenks: m.discretization_desc_jenks,
      quantile: m.discretization_desc_quantile,
      'equal-interval': m.discretization_desc_equal_interval,
      manual: m.discretization_desc_manual,
      q6: m.discretization_desc_q6,
      'nested-means': m.discretization_desc_nested_means,
      'head-tail': m.discretization_desc_head_tail
    };
    return descriptions[m_]();
  }

  const maxHistogramCount = $derived.by(() => {
    return Math.max(...breaks.map((b) => b.count), 1);
  });

  const isClassCountLocked = $derived(method === 'q6');
  const isNestedMeans = $derived(method === 'nested-means');

  const breakpointSliderValue = $derived(breakpointValue ?? 50);
  const dataMin = $derived(breaks[0]?.min ?? 0);
  const dataMax = $derived(breaks[breaks.length - 1]?.max ?? 100);

  function handleMethodChange(e: Event) {
    validationErrors = [];
    const target = e.target as HTMLSelectElement;
    const newMethod = target.value as ClassificationMethod;
    method = newMethod;
    if (newMethod === 'q6') {
      numClasses = 6;
      onclasseschange?.(6);
    } else if (newMethod === 'nested-means') {
      const closest = NESTED_MEANS_CLASS_COUNTS.reduce((prev, curr) =>
        Math.abs(curr - numClasses) < Math.abs(prev - numClasses) ? curr : prev
      );
      numClasses = closest;
      onclasseschange?.(closest);
    }
    onmethodchange?.(newMethod);
  }

  function handleClassesChange() {
    onclasseschange?.(numClasses);
  }

  function handleNestedMeansChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const value = Number(target.value);
    numClasses = value;
    onclasseschange?.(value);
  }

  function startEditingBreak(index: number) {
    editingBreakIndex = index;
  }

  function finishEditingBreak() {
    editingBreakIndex = null;
    validationErrors = validateBreaks(breaks);
    if (validationErrors.length === 0) {
      onbreakschange?.(breaks);
    }
  }

  let validationErrors = $state<string[]>([]);

  function validateBreaks(breaksToValidate: ClassBreak[]): string[] {
    const errors: string[] = [];

    for (let i = 0; i < breaksToValidate.length; i++) {
      const b = breaksToValidate[i];
      if (b.min > b.max) {
        errors.push(
          m.discretization_error_min_greater_max({ classNumber: i + 1 })
        );
      }
    }

    for (let i = 1; i < breaksToValidate.length; i++) {
      if (breaksToValidate[i].min < breaksToValidate[i - 1].max) {
        errors.push(m.discretization_error_overlapping({ classNumber: i + 1 }));
      }
    }

    return errors;
  }

  function updateBreakValue(
    index: number,
    field: 'min' | 'max',
    value: number
  ) {
    breaks[index][field] = value;
    validationErrors = validateBreaks(breaks);
  }
</script>

<div class="discretization-panel">
  <div class="section">
    <Select
      id="classification-method"
      labelText={m.discretization_method_label()}
      value={method}
      on:change={handleMethodChange}
    >
      <SelectItem value="jenks" text={m.discretization_method_jenks()} />
      <SelectItem value="quantile" text={m.discretization_method_quantile()} />
      <SelectItem value="q6" text={m.discretization_method_q6()} />
      <SelectItem
        value="equal-interval"
        text={m.discretization_method_equal_interval()}
      />
      <SelectItem
        value="nested-means"
        text={m.discretization_method_nested_means()}
      />
      <SelectItem
        value="head-tail"
        text={m.discretization_method_head_tail()}
      />
      <SelectItem value="manual" text={m.discretization_method_manual()} />
    </Select>
  </div>

  <div class="section">
    <div class="labeled-input">
      <p class="input-label">{m.discretization_num_classes()}</p>
      {#if isNestedMeans}
        <Select
          id="nested-means-classes"
          labelText=""
          hideLabel
          value={String(numClasses)}
          on:change={handleNestedMeansChange}
        >
          {#each NESTED_MEANS_CLASS_COUNTS as val (val)}
            <SelectItem value={String(val)} text={String(val)} />
          {/each}
        </Select>
      {:else}
        <CompactNumberInput
          bind:value={numClasses}
          min={2}
          max={classCountMax}
          disabled={isClassCountLocked}
          onchange={handleClassesChange}
          width="100%"
        />
      {/if}
    </div>
  </div>

  <div class="section breakpoint-section">
    <div class="breakpoint-row">
      <div class="breakpoint-input-col">
        <p class="input-label">{m.discretization_breakpoint_value()}</p>
        <TextInput
          id="breakpoint-value"
          size="sm"
          hideLabel
          labelText={m.discretization_breakpoint_value()}
          placeholder={m.discretization_none_placeholder()}
          value={breakpointValue !== null ? String(breakpointValue) : ''}
          on:input={(e) => {
            const target = e.target as HTMLInputElement;
            const parsed = parseFloat(target.value);
            breakpointValue = isNaN(parsed) ? null : parsed;
            onbreakpointchange?.(breakpointValue);
          }}
        />
      </div>
      <div class="breakpoint-slider-col">
        <p class="input-label">{m.discretization_position()}</p>
        <Slider
          min={dataMin}
          max={dataMax}
          value={breakpointSliderValue}
          hideTextInput
          on:change={(e) => {
            breakpointValue = e.detail;
            onbreakpointchange?.(e.detail);
          }}
        />
        <div class="palette-strip">
          {#each breaks as breakItem (breakItem.color)}
            <div
              class="palette-swatch"
              style="background-color: {breakItem.color}"
            ></div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  {#if showHistogram}
    <div class="section histogram-section">
      <p class="label">{m.discretization_value_distribution()}</p>
      <div class="histogram-rows">
        {#each breaks as breakItem, index (index)}
          {@const widthPercent = (breakItem.count / maxHistogramCount) * 100}
          <div class="histogram-row">
            <span class="histogram-label">
              {#if index === 0}Min.{/if}
            </span>
            <span class="histogram-value">
              {breakItem.min}
            </span>
            <Button
              kind="ghost"
              size="small"
              iconDescription={m.discretization_edit_bounds()}
              icon={CaretRight}
              on:click={() => startEditingBreak(index)}
              class="histogram-arrow-btn"
            />
            <div class="histogram-bar-wrapper">
              <div
                class="histogram-bar"
                style="width: {widthPercent}%; background-color: {breakItem.color}"
                title="{breakItem.min} - {breakItem.max}: {breakItem.count} {m.discretization_values()}"
              ></div>
            </div>
          </div>
        {/each}
        <div class="histogram-row histogram-row-max">
          <span class="histogram-label">Max.</span>
          <span class="histogram-value">
            {breaks[breaks.length - 1]?.max}
          </span>
          <div class="histogram-arrow-placeholder"></div>
          <div class="histogram-bar-wrapper"></div>
        </div>
      </div>
    </div>
  {/if}

  <div class="section description-section">
    <p class="method-description">{getMethodDescription(method)}</p>
    <a
      class="learn-more-link"
      href="https://observablehq.com/@d3/classification-methods"
      target="_blank"
      rel="noopener noreferrer"
    >
      {m.discretization_learn_more()}
      <Launch size={16} />
    </a>
  </div>

  {#if editingBreakIndex !== null || method === 'manual'}
    <div class="section breaks-section">
      <p class="label">
        {m.discretization_class_bounds()}
      </p>
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
                  labelText={m.filters_value_min()}
                  value={String(breakItem.min)}
                  on:input={(e) => {
                    const target = e.target as HTMLInputElement;
                    updateBreakValue(
                      index,
                      'min',
                      parseFloat(target.value) || 0
                    );
                  }}
                  on:blur={finishEditingBreak}
                />
                <span class="break-separator">—</span>
                <TextInput
                  id="break-max-{index}"
                  size="sm"
                  hideLabel
                  labelText={m.filters_value_max()}
                  value={String(breakItem.max)}
                  on:input={(e) => {
                    const target = e.target as HTMLInputElement;
                    updateBreakValue(
                      index,
                      'max',
                      parseFloat(target.value) || 0
                    );
                  }}
                  on:blur={finishEditingBreak}
                />
              </div>
            {:else}
              <Button
                kind="ghost"
                class="break-values"
                on:click={() => startEditingBreak(index)}
                aria-label={m.discretization_edit_bounds()}
              >
                <span>{breakItem.min}</span>
                <span class="break-separator">—</span>
                <span>{breakItem.max}</span>
                <Edit size={16} class="edit-icon" />
              </Button>
            {/if}

            <span class="break-count">{breakItem.count}</span>
          </div>
        {/each}
      </div>

      {#if validationErrors.length > 0}
        <div class="validation-errors">
          {#each validationErrors as error (error)}
            <div class="validation-error">
              <Information size={16} />
              <span>{error}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .discretization-panel {
    padding: var(--cds-spacing-05);
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

  .breakpoint-section {
    border-bottom: 1px solid var(--cds-border-subtle);
    padding-bottom: var(--cds-spacing-05);
  }

  .breakpoint-row {
    display: flex;
    gap: var(--cds-spacing-05);
  }

  .breakpoint-input-col {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    flex: 0 0 40%;
  }

  .breakpoint-slider-col {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    flex: 1;
    min-width: 0;
  }

  .palette-strip {
    display: flex;
    gap: 2px;
  }

  .palette-swatch {
    flex: 1;
    height: 20px;
    border-radius: 2px;
  }

  .histogram-section {
    padding-top: var(--cds-spacing-03);
  }

  .histogram-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .histogram-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    min-height: 28px;
    border-bottom: 1px solid var(--cds-border-subtle-00, rgba(0, 0, 0, 0.05));
  }

  .histogram-row-max {
    border-bottom: none;
  }

  .histogram-label {
    width: 28px;
    font-size: 0.75rem;
    color: var(--cds-text-02);
    flex-shrink: 0;
  }

  .histogram-value {
    width: 48px;
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    text-align: right;
    flex-shrink: 0;
  }

  :global(.histogram-arrow-btn) {
    min-height: 0 !important;
    padding: 0 !important;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: var(--cds-text-02);
  }

  .histogram-arrow-placeholder {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .histogram-bar-wrapper {
    flex: 1;
    min-width: 0;
    height: 24px;
    display: flex;
    align-items: center;
  }

  .histogram-bar {
    height: 100%;
    min-width: 4px;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .description-section {
    padding-top: var(--cds-spacing-03);
  }

  .method-description {
    font-size: 0.875rem;
    font-style: italic;
    color: var(--cds-text-secondary);
    line-height: 1.5;
    margin: 0 0 var(--cds-spacing-04);
  }

  .learn-more-link {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.875rem;
    color: var(--cds-link-primary);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  .breaks-section {
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
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

  :global(.break-values) {
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
  }

  :global(.break-values:hover) {
    background-color: var(--cds-layer-hover);
  }

  :global(.break-values:hover .edit-icon) {
    opacity: 1;
  }

  :global(.break-values .edit-icon) {
    opacity: 0;
    color: var(--cds-text-02);
    transition: opacity 0.15s ease;
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

  .validation-errors {
    margin-top: var(--cds-spacing-03);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .validation-error {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    color: var(--cds-support-error);
    font-size: 0.75rem;
    padding: var(--cds-spacing-02);
    background: var(--cds-notification-error-background, #fff1f1);
    border-radius: 4px;
  }
</style>
