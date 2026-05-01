<script lang="ts">
  import { onDestroy } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import { SLIDER_DEBOUNCE_MS } from '$lib/features/main-toolbar/constants';
  import {
    DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
    NESTED_MEANS_CLASS_COUNTS,
    resolveBreakpointLowerClassCount
  } from './discretization.utils';
  import {
    Select,
    SelectItem,
    Slider,
    TextInput
  } from 'carbon-components-svelte';
  import { CaretRight, Information, Launch } from 'carbon-icons-svelte';
  import type { ShapeType } from '$lib/features/main-toolbar/constants';

  type ClassificationMethod =
    | 'kmeans'
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

  interface SizePreview {
    shape: ShapeType;
    minSize: number;
    maxSize: number;
  }

  interface BinFillStrategy {
    mode: 'unique' | 'classes';
    colors: string[];
  }

  interface Props {
    method?: ClassificationMethod;
    numClasses?: number;
    classCountMax?: number;
    breaks?: ClassBreak[];
    breakpointValue?: number | null;
    breakpointLowerClassCount?: number | null;
    showBreakpointControls?: boolean;
    divergingPreviewColors?: string[];
    showHistogram?: boolean;
    sizePreview?: SizePreview;
    binFillStrategy?: BinFillStrategy;
    onmethodchange?: (method: ClassificationMethod) => void;
    onclasseschange?: (num: number) => void;
    onbreakpointchange?: (value: number | null) => void;
    onbreakpointpositionchange?: (lowerClassCount: number) => void;
    onbreakschange?: (breaks: ClassBreak[]) => void;
  }

  let {
    method = $bindable<ClassificationMethod>('kmeans'),
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
    breakpointLowerClassCount = $bindable<number | null>(null),
    showBreakpointControls = true,
    divergingPreviewColors = [],
    showHistogram = true,
    sizePreview,
    binFillStrategy = { mode: 'unique', colors: [] },
    onmethodchange,
    onclasseschange,
    onbreakpointchange,
    onbreakpointpositionchange,
    onbreakschange
  }: Props = $props();

  const paletteStripColors = $derived.by(() => {
    if (divergingPreviewColors.length > 0) return divergingPreviewColors;
    return breaks.map((b) => b.color);
  });

  function getMethodDescription(m_: ClassificationMethod): string {
    const descriptions: Record<ClassificationMethod, () => string> = {
      kmeans: m.discretization_desc_kmeans,
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

  const dataMin = $derived(breaks[0]?.min ?? 0);
  const dataMax = $derived.by(() => {
    const max = breaks[breaks.length - 1]?.max ?? 100;
    return max > dataMin ? max : dataMin + 1;
  });
  const breakpointLowerClassCountMax = $derived(
    Math.max(1, Math.floor(numClasses) - 1)
  );
  const isBreakpointValueValid = $derived(
    breakpointValue !== null &&
      Number.isFinite(breakpointValue) &&
      breakpointValue > dataMin &&
      breakpointValue < dataMax
  );
  const canUseBreakpointPosition = $derived(
    isBreakpointValueValid || breaks.length > 1
  );
  const breakpointSliderValue = $derived(
    resolveBreakpointLowerClassCount(numClasses, breakpointLowerClassCount)
  );

  let validationErrors = $state<string[]>([]);
  let breakpointInputValue = $derived(
    breakpointValue !== null && Number.isFinite(breakpointValue)
      ? String(breakpointValue)
      : ''
  );

  let breakpointPositionTimer: ReturnType<typeof setTimeout> | null = null;
  let breakpointPositionPending: number | null = null;

  function flushBreakpointPosition() {
    if (breakpointPositionTimer !== null) {
      clearTimeout(breakpointPositionTimer);
      breakpointPositionTimer = null;
    }
    if (breakpointPositionPending !== null) {
      const next = breakpointPositionPending;
      breakpointPositionPending = null;
      onbreakpointpositionchange?.(next);
    }
  }

  function scheduleBreakpointPosition(next: number) {
    const lowerClassCount = resolveBreakpointLowerClassCount(numClasses, next);
    breakpointLowerClassCount = lowerClassCount;
    breakpointPositionPending = lowerClassCount;
    if (breakpointPositionTimer !== null) {
      clearTimeout(breakpointPositionTimer);
    }
    breakpointPositionTimer = setTimeout(
      flushBreakpointPosition,
      SLIDER_DEBOUNCE_MS.CLASSIFICATION
    );
  }

  onDestroy(flushBreakpointPosition);

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

  function handleBreakpointValueInput(e: Event) {
    const detail = (e as CustomEvent<string>).detail;
    const rawValue =
      typeof detail === 'string'
        ? detail
        : ((e.target as HTMLInputElement | null)?.value ?? '');

    breakpointInputValue = rawValue;

    if (rawValue.trim() === '') {
      breakpointValue = null;
      onbreakpointchange?.(null);
      return;
    }

    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed > dataMin && parsed < dataMax) {
      breakpointValue = parsed;
      onbreakpointchange?.(parsed);
    }
  }

  function handleNestedMeansChange(e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    const value = Number(target.value);
    numClasses = value;
    onclasseschange?.(value);
  }

  function canEditBreakRow(index: number): boolean {
    return index > 0 && index < breaks.length;
  }

  function resolveHistogramColor(breakItem: ClassBreak, index: number): string {
    if (binFillStrategy.colors.length === 0) {
      return breakItem.color;
    }

    if (binFillStrategy.mode === 'unique') {
      return binFillStrategy.colors[0] ?? breakItem.color;
    }

    return (
      binFillStrategy.colors[index] ??
      binFillStrategy.colors[0] ??
      breakItem.color
    );
  }

  function resolveSizePreviewStyle(index: number): string {
    if (!sizePreview) {
      return '';
    }

    const total = Math.max(1, breaks.length - 1);
    const ratio = index / total;
    const size = Math.round(
      sizePreview.minSize + (sizePreview.maxSize - sizePreview.minSize) * ratio
    );

    return `--preview-size: ${Math.max(1, size)}px;`;
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
      if (method !== 'manual') {
        const wasQ6 = method === 'q6';
        method = 'manual';
        onmethodchange?.('manual');
        if (wasQ6) {
          onclasseschange?.(nextBreaks.length);
        }
      }
      onbreakschange?.(nextBreaks);
    }
  }
</script>

<div class="discretization-panel">
  <div class="section">
    <Select
      id="classification-method"
      labelText={m.discretization_method_label()}
      selected={method}
      on:change={handleMethodChange}
    >
      <SelectItem value="kmeans" text={m.discretization_method_kmeans()} />
      <SelectItem value="quantile" text={m.discretization_method_quantile()} />
      <SelectItem
        value="equal-interval"
        text={m.discretization_method_equal_interval()}
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

  {#if showBreakpointControls}
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
            value={breakpointInputValue}
            on:input={handleBreakpointValueInput}
          />
        </div>
        <div class="breakpoint-slider-col">
          <p class="input-label">{m.discretization_position()}</p>
          <div
            class="breakpoint-slider-host"
            role="presentation"
            onpointerupcapture={flushBreakpointPosition}
            onkeyupcapture={flushBreakpointPosition}
            onpointerleave={flushBreakpointPosition}
          >
            <Slider
              min={1}
              max={breakpointLowerClassCountMax}
              value={breakpointSliderValue}
              step={1}
              disabled={!canUseBreakpointPosition}
              hideTextInput
              minLabel=""
              maxLabel=""
              on:input={(e) => scheduleBreakpointPosition(e.detail)}
            />
          </div>
          <div class="palette-strip">
            {#each paletteStripColors as color, index (`${index}-${color}`)}
              <div
                class="palette-swatch"
                style="background-color: {color}"
              ></div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if showHistogram}
    <div class="section histogram-section">
      <p class="section-label">{m.discretization_value_distribution()}</p>
      <div class="histogram-rows">
        {#each breaks as breakItem, index (index)}
          {@const widthPercent = (breakItem.count / maxHistogramCount) * 100}
          {@const histogramColor = resolveHistogramColor(breakItem, index)}
          <div class="histogram-row">
            <div class="histogram-label">
              {#if index === 0}{m.discretization_min_abbrev()}{/if}
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
            {#if sizePreview}
              <div
                class="break-preview"
                data-shape={sizePreview.shape}
                style={resolveSizePreviewStyle(index)}
              ></div>
            {/if}
            <div class="histogram-bar-wrapper">
              <div
                class="histogram-bar"
                style="width: {widthPercent}%; background-color: {histogramColor}"
                title="{breakItem.min} - {breakItem.max}: {breakItem.count} {m.discretization_values()}"
              ></div>
            </div>
          </div>
        {/each}
        <div class="histogram-row">
          <div class="histogram-label">{m.discretization_max_abbrev()}</div>
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
      href="https://pro.arcgis.com/en/pro-app/latest/help/mapping/layer-properties/data-classification-methods.htm"
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
    padding: 0 var(--cds-spacing-05) var(--cds-spacing-05);
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

  .break-preview {
    width: var(--preview-size);
    height: var(--preview-size);
    max-width: 28px;
    max-height: 28px;
    min-width: 4px;
    min-height: 4px;
    flex-shrink: 0;
    background: var(--cds-icon-primary, #161616);
  }

  .break-preview[data-shape='circle'] {
    border-radius: 50%;
  }

  .break-preview[data-shape='triangle'] {
    width: 0;
    height: 0;
    background: transparent;
    border-left: calc(var(--preview-size) / 2) solid transparent;
    border-right: calc(var(--preview-size) / 2) solid transparent;
    border-bottom: var(--preview-size) solid var(--cds-icon-primary, #161616);
  }

  .break-preview[data-shape='bar'],
  .break-preview[data-shape='spike'],
  .break-preview[data-shape='line'] {
    width: calc(var(--preview-size) * 0.45);
    height: var(--preview-size);
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
    padding-top: var(--cds-spacing-02);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    margin-bottom: 0;
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
