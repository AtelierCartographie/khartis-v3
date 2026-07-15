<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { EVENT, KEY } from '$lib/features/commons/constants/dom.constants';
  import { portal } from '$lib/features/commons/utils/portal';
  import {
    MAIN_TOOLBAR_ID,
    resolveToolbarPanelWidthFromClassName
  } from '$lib/features/commons/utils/toolbar-width.utils';
  import { Close } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import DiscretizationPanel from './discretization-panel.svelte';
  import {
    ClassificationMethod,
    type ClassificationConfig,
    type VisualizationConfig
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import type { ShapeType } from '$lib/features/commons/constants/visualization.constants';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import { tick, untrack } from 'svelte';
  import {
    DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
    normalizeClassificationMethod,
    resolveBreakpointLowerClassCount,
    resolveComputedClassCount,
    resolveHeadTailClassCountMax,
    resolveRequestedClassCount
  } from '$lib/features/commons/utils/discretization.utils';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import {
    computeClassificationBreaks,
    resolveClassificationBreakColors,
    type ClassificationBreaksComputation
  } from '../../hooks/use-classification-breaks.svelte';

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
    open?: boolean;
    visualization?: VisualizationConfig;
    classification?: ClassificationConfig;
    valueColumn?: string;
    showBreakpointControls?: boolean;
    role?: 'fill' | 'stroke' | 'size';
    sizePreview?: SizePreview;
    binFillStrategy?: BinFillStrategy;
    onclose?: () => void;
    onchange?: (classification: Partial<ClassificationConfig>) => void;
  }

  let {
    open = $bindable(false),
    visualization,
    classification: classificationOverride,
    valueColumn,
    showBreakpointControls = true,
    role = 'fill',
    sizePreview,
    binFillStrategy,
    onclose,
    onchange
  }: Props = $props();

  const activeClassification = $derived<ClassificationConfig | undefined>(
    classificationOverride
  );
  const activeValueColumn = $derived(valueColumn);
  const activeContextKey = $derived(
    `${visualization?.id ?? ''}:${role}:${activeValueColumn ?? ''}`
  );

  let isCalculating = $state(false);
  let breaksRequestId = 0;
  let lastLocalClassification = $state<
    Partial<ClassificationConfig> | undefined
  >(undefined);
  let lastLocalContextKey = $state('');

  let currentMethod = $state<ClassificationMethod>(ClassificationMethod.KMEANS);
  let currentNumClasses = $state(5);
  let mergedClassCount = $state<number | null>(null);
  let currentBreaks = $state<ClassBreak[]>([]);
  let currentBreakpoint = $state<number | null>(null);
  let currentBreakpointLowerClassCount = $state<number | null>(null);
  let headTailClassCountMax = $state(DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX);
  let panelRenderKey = $state(0);
  let panelRight = $state(readPanelRight());
  let wasOpen = $state(false);
  const contextualSurfaceId = createExclusiveContextualSurfaceId(
    'discretization-modal'
  );

  function getFallbackPanelRight(toolbarClassName = ''): string {
    return resolveToolbarPanelWidthFromClassName(toolbarClassName);
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

  function updatePanelPosition(): void {
    panelRight = readPanelRight();
  }

  function syncStateFromVisualization(
    classification: ClassificationConfig | undefined
  ) {
    const method = normalizeClassificationMethod(
      classification?.method ?? ClassificationMethod.KMEANS
    );
    const storedNumClasses =
      classification?.numClasses ?? classification?.classes ?? 5;
    const actualClassCount = classification?.counts?.length;

    currentMethod = method;
    currentNumClasses = resolveComputedClassCount(
      method,
      storedNumClasses,
      actualClassCount ?? storedNumClasses
    );
    currentBreakpoint = classification?.breakpointValue ?? null;
    currentBreakpointLowerClassCount = resolveBreakpointLowerClassCount(
      currentNumClasses,
      classification?.breakpointLowerClassCount
    );
    headTailClassCountMax =
      method === ClassificationMethod.HEAD_TAIL
        ? resolveHeadTailClassCountMax(actualClassCount ?? storedNumClasses)
        : DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;
    mergedClassCount = null;
    lastLocalClassification = cloneClassification(classification);
    lastLocalContextKey = activeContextKey;
  }

  function cloneClassification(
    classification: Partial<ClassificationConfig> | undefined
  ): Partial<ClassificationConfig> | undefined {
    if (!classification) {
      return undefined;
    }

    return {
      ...classification,
      breaks: classification.breaks ? [...classification.breaks] : undefined,
      counts: classification.counts ? [...classification.counts] : undefined,
      colors: classification.colors ? [...classification.colors] : undefined,
      labels: classification.labels ? [...classification.labels] : undefined,
      disabledLabels: classification.disabledLabels
        ? [...classification.disabledLabels]
        : undefined,
      categoryShapes: classification.categoryShapes
        ? [...classification.categoryShapes]
        : undefined,
      patternParams: classification.patternParams
        ? { ...classification.patternParams }
        : undefined
    };
  }

  function resolveDivergingPreviewColors(classCount: number): string[] {
    return resolveClassificationBreakColors(
      activeClassification,
      classCount,
      getCurrentBreakValues(),
      currentBreakpoint
    );
  }

  const divergingPreview = $derived(
    resolveDivergingPreviewColors(currentNumClasses)
  );

  function toClassBreaks(
    min: number,
    max: number,
    breaks: number[],
    counts: number[],
    colors: string[]
  ): ClassBreak[] {
    const allBreaks = [min, ...breaks, max];

    return counts.map((count, index) => ({
      min: allBreaks[index],
      max: allBreaks[index + 1],
      count,
      color: colors[index] || colors[colors.length - 1]
    }));
  }

  function getCurrentBreakValues(): number[] {
    if (currentBreaks.length > 1) {
      return currentBreaks.slice(0, -1).map((breakItem) => breakItem.max);
    }

    return activeClassification?.breaks ?? [];
  }

  function getCurrentCounts(): number[] {
    if (currentBreaks.length > 0) {
      return currentBreaks.map((breakItem) => breakItem.count);
    }

    return activeClassification?.counts ?? [];
  }

  function getLocalClassificationBase():
    Partial<ClassificationConfig> | undefined {
    return lastLocalContextKey === activeContextKey
      ? (lastLocalClassification ?? activeClassification)
      : activeClassification;
  }

  function buildBreakpointClassification(
    breakpointValue: number | null
  ): Partial<ClassificationConfig> | undefined {
    const breakValues = getCurrentBreakValues();
    const counts = getCurrentCounts();
    const actualClassCount =
      counts.length > 0 ? counts.length : currentBreaks.length;

    if (actualClassCount <= 0 || breakValues.length !== actualClassCount - 1) {
      return undefined;
    }

    currentNumClasses = actualClassCount;

    const baseClassification = getLocalClassificationBase();
    const colors = resolveClassificationBreakColors(
      baseClassification as ClassificationConfig | undefined,
      actualClassCount,
      breakValues,
      breakpointValue
    );

    if (currentBreaks.length === actualClassCount) {
      currentBreaks = currentBreaks.map((breakItem, index) => ({
        ...breakItem,
        color: colors[index] ?? breakItem.color
      }));
    }

    return {
      method: currentMethod,
      classes: actualClassCount,
      numClasses: actualClassCount,
      breaks: breakValues,
      counts,
      colors,
      breakpointValue,
      breakpointLowerClassCount:
        breakpointValue !== null
          ? resolveBreakpointLowerClassCount(
              actualClassCount,
              currentBreakpointLowerClassCount
            )
          : undefined,
      paletteId: baseClassification?.paletteId,
      inverted: baseClassification?.inverted ?? false,
      labels: undefined,
      disabledLabels: undefined,
      categoryShapes: undefined
    } satisfies Partial<ClassificationConfig>;
  }

  function applyBreaksResult(
    computation: ClassificationBreaksComputation | null
  ) {
    if (!computation) {
      return;
    }

    const { actualClassCount, colors, normalizedMethod, result } = computation;

    mergedClassCount =
      actualClassCount < computation.requestedClassCount
        ? actualClassCount
        : null;
    currentNumClasses = actualClassCount;
    currentBreakpointLowerClassCount = resolveBreakpointLowerClassCount(
      actualClassCount,
      computation.breakpointLowerClassCount ?? currentBreakpointLowerClassCount
    );
    currentBreaks = toClassBreaks(
      result.min,
      result.max,
      result.breaks,
      result.counts,
      colors
    );
    headTailClassCountMax =
      normalizedMethod === ClassificationMethod.HEAD_TAIL
        ? resolveHeadTailClassCountMax(computation.result.counts.length)
        : DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;

    const nextClassification = {
      method: normalizedMethod,
      classes: actualClassCount,
      numClasses: actualClassCount,
      breaks: result.breaks,
      counts: result.counts,
      colors,
      breakpointValue: currentBreakpoint,
      breakpointLowerClassCount:
        currentBreakpoint !== null
          ? currentBreakpointLowerClassCount
          : undefined,
      paletteId: activeClassification?.paletteId,
      inverted: activeClassification?.inverted ?? false,
      labels: undefined,
      disabledLabels: undefined,
      categoryShapes: undefined
    } satisfies Partial<ClassificationConfig>;

    lastLocalClassification = cloneClassification(nextClassification);
    lastLocalContextKey = activeContextKey;
    onchange?.(nextClassification);
  }

  $effect(() => {
    const isOpening = open && !wasOpen;
    wasOpen = open;

    if (!isOpening) {
      return;
    }

    const classificationForSync =
      lastLocalContextKey === activeContextKey
        ? ((lastLocalClassification ?? activeClassification) as
            ClassificationConfig | undefined)
        : activeClassification;

    syncStateFromVisualization(classificationForSync);
    panelRenderKey += 1;
    updatePanelPosition();

    if (!visualization?.datasetId || !activeValueColumn) {
      return;
    }

    untrack(async () => {
      await tick();
      await computeBreaks();
    });
  });

  $effect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleKeydown = (e: KeyboardEvent) => {
      if (untrack(() => open) && e.key === KEY.ESCAPE) {
        handleClose();
      }
    };

    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
    };
  });

  $effect(() => {
    if (!open) {
      return;
    }

    return engageExclusiveContextualSurface(contextualSurfaceId, handleClose);
  });

  $effect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    updatePanelPosition();

    const toolbar = document.getElementById(MAIN_TOOLBAR_ID);
    const resizeObserver =
      toolbar && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            updatePanelPosition();
          })
        : null;

    if (toolbar && resizeObserver) {
      resizeObserver.observe(toolbar);
    }

    window.addEventListener(EVENT.RESIZE, updatePanelPosition);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener(EVENT.RESIZE, updatePanelPosition);
    };
  });

  async function computeBreaks(): Promise<boolean> {
    if (!visualization?.datasetId || !activeValueColumn) {
      return false;
    }

    const dataset = datasetsStore.datasets.find(
      (d) => d.id === visualization.datasetId
    );
    if (!dataset?.sourceFileId) {
      return false;
    }

    const myRequestId = ++breaksRequestId;
    isCalculating = true;
    try {
      const storeMethod = normalizeClassificationMethod(currentMethod);
      const computation = await computeClassificationBreaks({
        datasetSourceFileId: dataset.sourceFileId,
        valueColumn: activeValueColumn,
        classification: activeClassification,
        method: storeMethod,
        numClasses: currentNumClasses,
        breakValues: getCurrentBreakValues(),
        breakpointValue: currentBreakpoint,
        breakpointLowerClassCount:
          currentBreakpoint !== null
            ? currentBreakpointLowerClassCount
            : undefined
      });

      if (myRequestId !== breaksRequestId) return false;

      applyBreaksResult(computation);
      return Boolean(computation);
    } finally {
      isCalculating = false;
    }
  }

  function persistSelectionDraft(
    options?: {
      method?: ClassificationMethod;
      numClasses?: number;
      breakpointValue?: number | null;
      breakpointLowerClassCount?: number | null;
    },
    emit = true
  ) {
    const method = options?.method ?? currentMethod;
    const storeMethod = normalizeClassificationMethod(method);
    const requestedClassCount = resolveRequestedClassCount(
      storeMethod,
      options?.numClasses ?? currentNumClasses
    );
    const breakpointValue =
      options &&
      Object.prototype.hasOwnProperty.call(options, 'breakpointValue')
        ? (options.breakpointValue ?? null)
        : currentBreakpoint;
    const breakpointLowerClassCount =
      breakpointValue !== null
        ? resolveBreakpointLowerClassCount(
            requestedClassCount,
            options?.breakpointLowerClassCount ??
              currentBreakpointLowerClassCount
          )
        : undefined;

    const nextClassification = {
      method: storeMethod,
      classes: requestedClassCount,
      numClasses: requestedClassCount,
      breaks: undefined,
      counts: undefined,
      breakpointValue,
      breakpointLowerClassCount,
      paletteId: activeClassification?.paletteId,
      inverted: activeClassification?.inverted ?? false,
      labels: undefined,
      disabledLabels: undefined,
      categoryShapes: undefined
    } satisfies Partial<ClassificationConfig>;

    lastLocalClassification = cloneClassification({
      ...(lastLocalContextKey === activeContextKey
        ? lastLocalClassification
        : activeClassification),
      ...nextClassification
    });
    lastLocalContextKey = activeContextKey;
    if (emit) {
      onchange?.(nextClassification);
    }
  }

  function handleMethodChange(method: ClassificationMethod) {
    currentMethod = method;
    currentNumClasses = resolveRequestedClassCount(
      normalizeClassificationMethod(method),
      method === ClassificationMethod.HEAD_TAIL
        ? DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX
        : currentNumClasses
    );
    currentBreakpointLowerClassCount = resolveBreakpointLowerClassCount(
      currentNumClasses,
      currentBreakpointLowerClassCount
    );
    if (method !== ClassificationMethod.HEAD_TAIL) {
      headTailClassCountMax = DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;
    }
    persistSelectionDraft(
      {
        method,
        numClasses: currentNumClasses
      },
      false
    );
    void computeBreaks();
  }

  function handleClassesChange(num: number) {
    currentNumClasses = resolveRequestedClassCount(
      normalizeClassificationMethod(currentMethod),
      num
    );
    currentBreakpointLowerClassCount = resolveBreakpointLowerClassCount(
      currentNumClasses,
      currentBreakpointLowerClassCount
    );
    persistSelectionDraft({ numClasses: currentNumClasses }, false);
    void computeBreaks();
  }

  function handleBreakpointChange(value: number | null) {
    currentBreakpoint = value;
    currentBreakpointLowerClassCount =
      value !== null
        ? resolveBreakpointLowerClassCount(
            currentNumClasses,
            currentBreakpointLowerClassCount
          )
        : null;
    void computeBreaks().then((computed) => {
      if (computed) {
        return;
      }

      const nextClassification = buildBreakpointClassification(value);
      if (!nextClassification) {
        persistSelectionDraft({ breakpointValue: value });
        return;
      }

      lastLocalClassification = cloneClassification(nextClassification);
      lastLocalContextKey = activeContextKey;
      onchange?.(nextClassification);
    });
  }

  function resolveBreakpointFromLowerClassCount(
    lowerClassCount: number
  ): number | null {
    const breakValues = getCurrentBreakValues();
    if (breakValues.length === 0) {
      return null;
    }

    const index = Math.max(
      0,
      Math.min(breakValues.length - 1, lowerClassCount - 1)
    );
    const value = breakValues[index];

    return Number.isFinite(value) ? value : null;
  }

  function handleBreakpointPositionChange(lowerClassCount: number) {
    currentBreakpointLowerClassCount = resolveBreakpointLowerClassCount(
      currentNumClasses,
      lowerClassCount
    );
    if (currentBreakpoint === null) {
      currentBreakpoint = resolveBreakpointFromLowerClassCount(
        currentBreakpointLowerClassCount
      );
    }

    if (currentBreakpoint === null) {
      return;
    }

    void computeBreaks().then((computed) => {
      if (computed) {
        return;
      }

      const nextClassification =
        buildBreakpointClassification(currentBreakpoint);
      if (!nextClassification) {
        persistSelectionDraft({
          breakpointValue: currentBreakpoint,
          breakpointLowerClassCount: currentBreakpointLowerClassCount
        });
        return;
      }

      lastLocalClassification = cloneClassification(nextClassification);
      lastLocalContextKey = activeContextKey;
      onchange?.(nextClassification);
    });
  }

  function handleBreaksChange(breaks: ClassBreak[]) {
    currentBreaks = breaks;
    void computeBreaks();
  }

  function handleClose() {
    wasOpen = false;
    open = false;
    onclose?.();
  }
</script>

{#if open}
  <aside
    use:portal
    class="discretization-floating-panel"
    style:right={panelRight}
    aria-label={m.discretization()}
    data-role={role}
  >
    <header class="panel-header">
      <h3>{m.discretization()}</h3>
      <IconButton
        kind="ghost"
        size="small"
        icon={Close}
        iconDescription={m.close()}
        on:click={handleClose}
      />
    </header>
    <div class="panel-body" aria-busy={isCalculating}>
      {#key panelRenderKey}
        <DiscretizationPanel
          bind:method={currentMethod}
          bind:numClasses={currentNumClasses}
          mergedClassCount={mergedClassCount}
          bind:breaks={currentBreaks}
          bind:breakpointValue={currentBreakpoint}
          bind:breakpointLowerClassCount={currentBreakpointLowerClassCount}
          showBreakpointControls={showBreakpointControls}
          divergingPreviewColors={divergingPreview}
          sizePreview={role === 'size' ? sizePreview : undefined}
          binFillStrategy={binFillStrategy}
          classCountMax={currentMethod === ClassificationMethod.HEAD_TAIL
            ? headTailClassCountMax
            : DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX}
          onmethodchange={handleMethodChange}
          onclasseschange={handleClassesChange}
          onbreakpointchange={handleBreakpointChange}
          onbreakpointpositionchange={handleBreakpointPositionChange}
          onbreakschange={handleBreaksChange}
        />
      {/key}
    </div>
  </aside>
{/if}

<style lang="scss">
  .discretization-floating-panel {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 320px;
    min-height: 320px;
    max-height: min(80vh, calc(100dvh - 120px));
    z-index: var(--z-dropdown);
    background: var(--cds-background, #ffffff);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 0 1px rgba(0, 0, 0, 0.15);
  }

  @media (max-width: 1023px) {
    .discretization-floating-panel {
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
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-04) var(--cds-spacing-02) var(--cds-spacing-03)
      var(--cds-spacing-05);
    position: sticky;
    top: 0;
    flex-shrink: 0;
    background: var(--cds-background, #ffffff);
    z-index: 1;

    h3 {
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.5rem;
      letter-spacing: 0;
      margin: 0;
      color: var(--cds-text-01);
    }
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding-top: var(--cds-spacing-03);
  }
</style>
