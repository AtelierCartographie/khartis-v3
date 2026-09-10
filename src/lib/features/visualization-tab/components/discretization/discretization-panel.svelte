<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { DOC_LINK } from '$lib/features/commons/constants/doc-links.constants';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import {
    SLIDER_DEBOUNCE_MS,
    DEFAULT_DISCRETIZATION_CLASS_COUNT
  } from '$lib/features/commons/constants/visualization.constants';
  import {
    DISCRETIZATION_NOTE,
    DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
    NESTED_MEANS_CLASS_COUNTS,
    normalizeClassificationMethod,
    Q6_CLASS_COUNT,
    resolveBreakpointLowerClassCount
  } from '$lib/features/commons/utils/discretization.utils';
  import type { DiscretizationNote } from '$lib/features/commons/utils/discretization.utils';
  import {
    Select,
    SelectItem,
    Slider,
    TextInput
  } from 'carbon-components-svelte';
  import { Information, Launch } from 'carbon-icons-svelte';
  import DiscretizationHistogram from './discretization-histogram.svelte';
  import { InfoPopover } from '../shared';
  import type { ShapeType } from '$lib/features/commons/constants/visualization.constants';
  import { ClassificationMethod } from '$lib/features/commons/stores/visualization.store.svelte';

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
    discretizationNote?: DiscretizationNote | null;
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
    method = $bindable<ClassificationMethod>(ClassificationMethod.KMEANS),
    numClasses = $bindable(DEFAULT_DISCRETIZATION_CLASS_COUNT),
    discretizationNote = null,
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

  const METHOD_DESCRIPTIONS: Record<ClassificationMethod, () => string> = {
    [ClassificationMethod.KMEANS]: m.discretization_desc_kmeans,
    [ClassificationMethod.QUANTILES]: m.discretization_desc_quantile,
    [ClassificationMethod.EQUAL_INTERVAL]: m.discretization_desc_equal_interval,
    [ClassificationMethod.MANUAL]: m.discretization_desc_manual,
    [ClassificationMethod.Q6]: m.discretization_desc_q6,
    [ClassificationMethod.NESTED_MEANS]: m.discretization_desc_nested_means,
    [ClassificationMethod.HEAD_TAIL]: m.discretization_desc_head_tail
  };

  function normalizePanelMethod(
    value: string | null | undefined
  ): ClassificationMethod {
    return normalizeClassificationMethod(value);
  }

  function getMethodDescription(
    methodValue: string | null | undefined
  ): string {
    return METHOD_DESCRIPTIONS[normalizePanelMethod(methodValue)]();
  }

  const maxHistogramCount = $derived.by(() => {
    return Math.max(...breaks.map((b) => b.count), 1);
  });

  const isClassCountLocked = $derived(method === ClassificationMethod.Q6);

  const NOTE_MESSAGES: Record<
    DiscretizationNote['kind'],
    (input: { count: number }) => string
  > = {
    [DISCRETIZATION_NOTE.MERGED_BREAKS]: m.discretization_merged_classes_note,
    [DISCRETIZATION_NOTE.HEAD_TAIL_LIMIT]:
      m.discretization_head_tail_limit_note,
    [DISCRETIZATION_NOTE.EMPTY_CLASSES]: m.discretization_empty_classes_note,
    [DISCRETIZATION_NOTE.Q6_UNAVAILABLE]: m.discretization_q6_unavailable_note
  };

  const discretizationNoteText = $derived(
    discretizationNote
      ? NOTE_MESSAGES[discretizationNote.kind]({
          count: discretizationNote.count
        })
      : null
  );
  const isNestedMeans = $derived(method === ClassificationMethod.NESTED_MEANS);

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
  const canUseBreakpointPosition = $derived(isBreakpointValueValid);
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

  $effect(() => () => {
    flushBreakpointPosition();
  });

  function handleMethodChange(e: Event) {
    validationErrors = [];
    const target = e.currentTarget as HTMLSelectElement;
    const newMethod = normalizePanelMethod(target.value);
    method = newMethod;
    if (newMethod === ClassificationMethod.Q6) {
      numClasses = Q6_CLASS_COUNT;
    } else if (newMethod === ClassificationMethod.NESTED_MEANS) {
      numClasses = NESTED_MEANS_CLASS_COUNTS.reduce((prev, curr) =>
        Math.abs(curr - numClasses) < Math.abs(prev - numClasses) ? curr : prev
      );
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
      if (method !== ClassificationMethod.MANUAL) {
        const wasQ6 = method === ClassificationMethod.Q6;
        method = ClassificationMethod.MANUAL;
        onmethodchange?.(ClassificationMethod.MANUAL);
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
      <SelectItem
        value={ClassificationMethod.KMEANS}
        text={m.discretization_method_kmeans()}
      />
      <SelectItem
        value={ClassificationMethod.QUANTILES}
        text={m.discretization_method_quantile()}
      />
      <SelectItem
        value={ClassificationMethod.EQUAL_INTERVAL}
        text={m.discretization_method_equal_interval()}
      />
      <SelectItem
        value={ClassificationMethod.Q6}
        text={m.discretization_method_q6()}
      />
      <SelectItem
        value={ClassificationMethod.NESTED_MEANS}
        text={m.discretization_method_nested_means()}
      />
      <SelectItem
        value={ClassificationMethod.HEAD_TAIL}
        text={m.discretization_method_head_tail()}
      />
      <SelectItem
        value={ClassificationMethod.MANUAL}
        text={m.discretization_method_manual()}
      />
    </Select>
  </div>

  <div class="section">
    <div class="labeled-input">
      <p class="input-label">{m.discretization_num_classes()}</p>
      {#if isNestedMeans}
        <Select
          id="nested-means-classes"
          labelText={m.discretization_num_classes()}
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
          ariaLabel={m.discretization_num_classes()}
          onchange={handleClassesChange}
          width="100%"
        />
      {/if}
    </div>
    {#if discretizationNoteText}
      <div class="class-count-note" role="status">
        <Information size={16} />
        <span>{discretizationNoteText}</span>
      </div>
    {/if}
  </div>

  {#if showBreakpointControls}
    <div class="section breakpoint-section">
      <div class="breakpoint-row">
        <div class="breakpoint-input-col">
          <p class="input-label">
            {m.discretization_breakpoint_value()}
            <InfoPopover text={m.discretization_breakpoint_info()} />
          </p>
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
    <DiscretizationHistogram
      breaks={breaks}
      maxHistogramCount={maxHistogramCount}
      sizePreview={sizePreview}
      validationErrors={validationErrors}
      canEditBreakRow={canEditBreakRow}
      resolveHistogramColor={resolveHistogramColor}
      resolveSizePreviewStyle={resolveSizePreviewStyle}
      onbreakvalueinput={updateBreakValue}
      onbreakblur={handleBreakBlur}
    />
  {/if}

  <div class="section description-section">
    <p class="method-description">{getMethodDescription(method)}</p>
    <a
      class="learn-more"
      href={DOC_LINK.DISCRETIZATION}
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
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    font-weight: 400;
  }

  .class-count-note {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    color: var(--cds-text-secondary, #525252);
    font-size: 0.75rem;
    line-height: 1rem;
    padding: var(--cds-spacing-02);
    background: var(--cds-notification-info-background, #edf5ff);
    border-radius: 4px;
    margin-top: var(--cds-spacing-03);

    :global(svg) {
      flex-shrink: 0;
    }
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
</style>
