<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import {
    DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
    NESTED_MEANS_CLASS_COUNTS
  } from './discretization.utils';
  import {
    Select,
    SelectItem,
    Slider,
    TextInput
  } from 'carbon-components-svelte';
  import { CaretRight, Information, Launch } from 'carbon-icons-svelte';

  type ClassificationMethod =
    | 'jenks'
    | 'quantile'
    | 'equal-interval'
    | 'standard-deviation'
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
    divergingPreviewColors?: string[];
    showHistogram?: boolean;
    onmethodchange?: (method: ClassificationMethod) => void;
    onclasseschange?: (num: number) => void;
    onbreakpointchange?: (value: number | null) => void;
    onbreakschange?: (breaks: ClassBreak[]) => void;
  }

  let {
    method = $bindable<ClassificationMethod>('jenks'),
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
    divergingPreviewColors = [],
    showHistogram = true,
    onmethodchange,
    onclasseschange,
    onbreakpointchange,
    onbreakschange
  }: Props = $props();

  const paletteStripColors = $derived.by(() => {
    if (divergingPreviewColors.length > 0) return divergingPreviewColors;
    return breaks.map((b) => b.color);
  });

  function getMethodDescription(m_: ClassificationMethod): string {
    const descriptions: Record<ClassificationMethod, () => string> = {
      jenks: m.discretization_desc_jenks,
      quantile: m.discretization_desc_quantile,
      'equal-interval': m.discretization_desc_equal_interval,
      'standard-deviation': m.discretization_desc_stddev,
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

  const dataMin = $derived(breaks[0]?.min ?? 0);
  const dataMax = $derived.by(() => {
    const max = breaks[breaks.length - 1]?.max ?? 100;
    return max > dataMin ? max : dataMin + 1;
  });
  const breakpointSliderValue = $derived.by(() => {
    if (breakpointValue !== null) {
      return breakpointValue;
    }

    return dataMin + (dataMax - dataMin) / 2;
  });

  let validationErrors = $state<string[]>([]);

  function handleMethodChange(e: Event) {
    validationErrors = [];
    const target = e.currentTarget as HTMLSelectElement;
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
    const target = e.currentTarget as HTMLSelectElement;
    const value = Number(target.value);
    numClasses = value;
    onclasseschange?.(value);
  }

  function canEditBreakRow(index: number): boolean {
    return method === 'manual' && index > 0;
  }

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

  function updateBreakValue(index: number, value: number) {
    if (!Number.isFinite(value) || index <= 0) {
      return;
    }

    const nextBreaks = breaks.map((breakItem) => ({ ...breakItem }));
    nextBreaks[index].min = value;
    nextBreaks[index - 1].max = value;
    breaks = nextBreaks;
    validationErrors = validateBreaks(nextBreaks);
  }

  function handleBreakBlur() {
    const nextBreaks = breaks.map((breakItem) => ({ ...breakItem }));
    validationErrors = validateBreaks(nextBreaks);
    if (validationErrors.length === 0) {
      onbreakschange?.(nextBreaks);
    }
  }
</script>

<div class="discretization-panel">
  <div class="section">
    <Select
      id="classification-method"
      labelText={m.discretization_method_label()}
      bind:selected={method}
      on:change={handleMethodChange}
    >
      <SelectItem value="jenks" text={m.discretization_method_jenks()} />
      <SelectItem value="quantile" text={m.discretization_method_quantile()} />
      <SelectItem
        value="equal-interval"
        text={m.discretization_method_equal_interval()}
      />
      <SelectItem
        value="standard-deviation"
        text={m.discretization_method_stddev()}
      />
      <SelectItem value="q6" text={m.discretization_method_q6()} />
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
          selected={String(numClasses)}
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
            const parsed = parseFloat(String(e.detail ?? ''));
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
          minLabel=""
          maxLabel=""
          on:input={(e) => {
            breakpointValue = e.detail;
            onbreakpointchange?.(e.detail);
          }}
        />
        <div class="palette-strip">
          {#each paletteStripColors as color, index (`${index}-${color}`)}
            <div class="palette-swatch" style="background-color: {color}"></div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  {#if showHistogram}
    <div class="section histogram-section">
      <p class="section-label">{m.discretization_value_distribution()}</p>
      <div class="histogram-rows">
        {#each breaks as breakItem, index (index)}
          {@const widthPercent = (breakItem.count / maxHistogramCount) * 100}
          <div class="histogram-row">
            <div class="histogram-label">
              {#if index === 0}Min.{/if}
            </div>
            <div class="histogram-input-wrapper">
              <TextInput
                id="break-value-{index}"
                size="sm"
                hideLabel
                labelText={m.filters_value_min()}
                disabled={!canEditBreakRow(index)}
                value={String(breakItem.min)}
                on:input={(e) => {
                  const value = Number(e.detail);
                  if (Number.isFinite(value)) {
                    updateBreakValue(index, value);
                  }
                }}
                on:blur={handleBreakBlur}
              />
            </div>
            <div class="histogram-caret">
              <CaretRight size={16} />
            </div>
            <div class="histogram-bar-wrapper">
              <div
                class="histogram-bar"
                style="width: {widthPercent}%; background-color: {breakItem.color}"
                title="{breakItem.min} - {breakItem.max}: {breakItem.count} {m.discretization_values()}"
              ></div>
            </div>
          </div>
        {/each}
        <div class="histogram-row">
          <div class="histogram-label">Max.</div>
          <div class="histogram-input-wrapper">
            <TextInput
              id="break-value-{breaks.length}"
              size="sm"
              hideLabel
              labelText={m.filters_value_max()}
              disabled
              value={String(breaks[breaks.length - 1]?.max ?? '')}
            />
          </div>
          <div class="histogram-caret">
            <CaretRight size={16} />
          </div>
          <div class="histogram-bar-wrapper"></div>
        </div>
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

  <div class="section description-section">
    <p class="method-description">{getMethodDescription(method)}</p>
    <a
      class="learn-more"
      href="https://observablehq.com/@d3/classification-methods"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>{m.discretization_learn_more()}</span>
      <Launch size={16} />
    </a>
  </div>
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
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    font-weight: 400;
  }

  .section-label {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    font-weight: 400;
    margin-bottom: var(--cds-spacing-03);
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

  .breakpoint-slider-col :global(.bx--slider__range-label) {
    display: none;
  }

  .palette-strip {
    display: flex;
    gap: 2px;
  }

  .palette-swatch {
    flex: 1;
    height: 20px;
  }

  .histogram-rows {
    display: flex;
    flex-direction: column;
  }

  .histogram-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    min-height: 32px;
  }

  .histogram-label {
    width: 27px;
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    flex-shrink: 0;
  }

  .histogram-input-wrapper {
    flex: 1;
    min-width: 64px;
  }

  .histogram-input-wrapper :global(.bx--form-item) {
    flex: none;
  }

  .histogram-input-wrapper :global(.bx--text-input) {
    background-color: transparent;
    border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
    text-align: right;
    color: var(--cds-text-secondary, #525252);
  }

  .histogram-input-wrapper :global(.bx--text-input:disabled) {
    background-color: transparent;
    border-bottom: 1px solid var(--cds-border-subtle, #e0e0e0);
    color: var(--cds-text-secondary, #525252);
    -webkit-text-fill-color: var(--cds-text-secondary, #525252);
  }

  .histogram-caret {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--cds-icon-primary, #161616);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .histogram-bar-wrapper {
    width: 128px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .histogram-bar {
    height: 100%;
    min-width: 2px;
  }

  .description-section {
    padding-top: var(--cds-spacing-03);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .method-description {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-helper, #6f6f6f);
    margin: 0;
  }

  .learn-more {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    color: var(--cds-text-helper, #6f6f6f);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    text-decoration: none;
    align-self: flex-start;

    &:hover {
      text-decoration: underline;
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus);
      outline-offset: 2px;
    }
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
