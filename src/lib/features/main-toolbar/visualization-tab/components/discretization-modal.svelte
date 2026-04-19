<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { EVENT, KEY } from '$lib/features/commons/constants/dom.constants';
  import { Close } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import DiscretizationPanel from './discretization-panel.svelte';
  import {
    ClassificationMethod,
    type ClassificationConfig,
    type VisualizationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    applyPaletteInversion,
    calculateBreakCounts,
    calculateBreaks,
    computeDivergingSplit,
    generateColorsForBreaks
  } from '$lib/features/commons/services/classification.service';
  import {
    findPaletteById,
    generatePaletteColors
  } from '$lib/features/commons/components/palette-popover/palette.constants';
  import { getColorBlindnessState } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { onMount, tick, untrack } from 'svelte';
  import {
    DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX,
    normalizeClassificationMethod,
    resolveComputedClassCount,
    resolveHeadTailClassCountMax,
    resolveRequestedClassCount
  } from './discretization.utils';

  type PanelMethod =
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
    open?: boolean;
    visualization?: VisualizationConfig;
    classification?: ClassificationConfig;
    onclose?: () => void;
    onchange?: (classification: Partial<ClassificationConfig>) => void;
  }

  let {
    open = $bindable(false),
    visualization,
    classification: classificationOverride,
    onclose,
    onchange
  }: Props = $props();

  const activeClassification = $derived<ClassificationConfig | undefined>(
    classificationOverride ?? visualization?.classification
  );

  let _isCalculating = $state(false);
  let breaksRequestId = 0;

  function storeMethodToPanelMethod(method: ClassificationMethod): PanelMethod {
    const mapping: Record<ClassificationMethod, PanelMethod> = {
      [ClassificationMethod.JENKS]: 'jenks',
      [ClassificationMethod.QUANTILES]: 'quantile',
      [ClassificationMethod.EQUAL_INTERVAL]: 'equal-interval',
      [ClassificationMethod.STANDARD_DEVIATION]: 'standard-deviation',
      [ClassificationMethod.MANUAL]: 'manual',
      [ClassificationMethod.Q6]: 'q6',
      [ClassificationMethod.NESTED_MEANS]: 'nested-means',
      [ClassificationMethod.HEAD_TAIL]: 'head-tail'
    };
    return mapping[method] ?? 'jenks';
  }

  function panelMethodToStoreMethod(method: PanelMethod): ClassificationMethod {
    const mapping: Record<PanelMethod, ClassificationMethod> = {
      jenks: ClassificationMethod.JENKS,
      quantile: ClassificationMethod.QUANTILES,
      'equal-interval': ClassificationMethod.EQUAL_INTERVAL,
      'standard-deviation': ClassificationMethod.STANDARD_DEVIATION,
      manual: ClassificationMethod.MANUAL,
      q6: ClassificationMethod.Q6,
      'nested-means': ClassificationMethod.NESTED_MEANS,
      'head-tail': ClassificationMethod.HEAD_TAIL
    };
    return mapping[method] ?? ClassificationMethod.JENKS;
  }

  let currentMethod = $state<PanelMethod>('jenks');
  let currentNumClasses = $state(5);
  let currentBreaks = $state<ClassBreak[]>([]);
  let currentBreakpoint = $state<number | null>(null);
  let headTailClassCountMax = $state(DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX);
  let panelRenderKey = $state(0);
  const MAIN_TOOLBAR_ID = 'khartis-main-toolbar';
  let panelRight = $state(readPanelRight());
  let wasOpen = $state(false);

  function getFallbackPanelRight(toolbarClassName = ''): string {
    if (toolbarClassName.includes('collapsed')) {
      return '50px';
    }

    if (toolbarClassName.includes('full')) {
      return 'clamp(400px, 50vw, 800px)';
    }

    return '434px';
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
      classification?.method ?? ClassificationMethod.JENKS
    );
    const storedNumClasses =
      classification?.numClasses ?? classification?.classes ?? 5;
    const actualClassCount = classification?.counts?.length;

    currentMethod = storeMethodToPanelMethod(method);
    currentNumClasses = resolveComputedClassCount(
      method,
      storedNumClasses,
      actualClassCount ?? storedNumClasses
    );
    currentBreakpoint = classification?.breakpointValue ?? null;
    headTailClassCountMax =
      method === ClassificationMethod.HEAD_TAIL
        ? resolveHeadTailClassCountMax(actualClassCount ?? storedNumClasses)
        : DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;
  }

  function resolvePaletteColors(
    classCount: number,
    breakValues: readonly number[]
  ): string[] {
    const paletteType = currentBreakpoint !== null ? 'diverging' : 'sequential';
    const contrast = getColorBlindnessState().enabled
      ? ('high' as const)
      : undefined;
    const userPalette = activeClassification?.paletteId
      ? findPaletteById(activeClassification.paletteId)
      : undefined;
    const divergingSplit =
      paletteType === 'diverging'
        ? computeDivergingSplit(classCount, breakValues, currentBreakpoint)
        : undefined;

    return applyPaletteInversion(
      userPalette
        ? generatePaletteColors(userPalette, classCount, contrast)
        : generateColorsForBreaks(
            classCount,
            paletteType,
            contrast,
            divergingSplit
          ),
      activeClassification?.inverted ?? false
    );
  }

  function resolveDivergingPreviewColors(classCount: number): string[] {
    const contrast = getColorBlindnessState().enabled
      ? ('high' as const)
      : undefined;
    const userPalette = activeClassification?.paletteId
      ? findPaletteById(activeClassification.paletteId)
      : undefined;

    return applyPaletteInversion(
      userPalette
        ? generatePaletteColors(userPalette, classCount, contrast)
        : generateColorsForBreaks(classCount, 'diverging', contrast),
      activeClassification?.inverted ?? false
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

  function applyBreaksResult(
    storeMethod: ClassificationMethod,
    requestedClassCount: number,
    result: Awaited<ReturnType<typeof calculateBreaks>>
  ) {
    if (!result) {
      return;
    }

    const actualClassCount = result.counts.length;
    const resolvedClassCount = resolveComputedClassCount(
      storeMethod,
      requestedClassCount,
      actualClassCount
    );
    const colors = resolvePaletteColors(resolvedClassCount, result.breaks);

    currentNumClasses = resolvedClassCount;
    currentBreaks = toClassBreaks(
      result.min,
      result.max,
      result.breaks,
      result.counts,
      colors
    );
    headTailClassCountMax =
      storeMethod === ClassificationMethod.HEAD_TAIL
        ? resolveHeadTailClassCountMax(actualClassCount)
        : DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;

    onchange?.({
      method: storeMethod,
      classes: resolvedClassCount,
      numClasses: resolvedClassCount,
      breaks: result.breaks,
      counts: result.counts,
      colors,
      breakpointValue: currentBreakpoint,
      paletteId: activeClassification?.paletteId,
      inverted: activeClassification?.inverted ?? false
    });
  }

  $effect(() => {
    const isOpening = open && !wasOpen;
    wasOpen = open;

    if (!isOpening) {
      return;
    }

    syncStateFromVisualization(activeClassification);
    panelRenderKey += 1;
    updatePanelPosition();

    if (!visualization?.datasetId || !visualization?.mapping.valueColumn) {
      return;
    }

    untrack(async () => {
      await tick();
      await computeBreaks();
    });
  });

  onMount(() => {
    if (typeof window === 'undefined') {
      return;
    }

    function handleKeydown(e: KeyboardEvent) {
      if (open && e.key === KEY.ESCAPE) {
        handleClose();
      }
    }

    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
    };
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

  async function computeBreaks() {
    if (!visualization?.datasetId || !visualization?.mapping.valueColumn) {
      return;
    }

    const dataset = datasetsStore.datasets.find(
      (d) => d.id === visualization.datasetId
    );
    if (!dataset?.sourceFileId) {
      return;
    }

    const myRequestId = ++breaksRequestId;
    _isCalculating = true;
    try {
      const storeMethod = panelMethodToStoreMethod(currentMethod);
      const requestedClassCount = resolveRequestedClassCount(
        storeMethod,
        currentNumClasses
      );
      let result: Awaited<ReturnType<typeof calculateBreaks>> = null;

      if (storeMethod === ClassificationMethod.MANUAL) {
        const breakValues = getCurrentBreakValues();
        const expectedThresholdCount = Math.max(currentNumClasses - 1, 0);

        if (breakValues.length === expectedThresholdCount) {
          result = await calculateBreakCounts({
            datasetId: dataset.sourceFileId,
            columnName: visualization.mapping.valueColumn,
            breaks: breakValues
          });
        } else {
          result = await calculateBreaks({
            datasetId: dataset.sourceFileId,
            columnName: visualization.mapping.valueColumn,
            method: ClassificationMethod.EQUAL_INTERVAL,
            numClasses: requestedClassCount
          });
        }
      } else {
        result = await calculateBreaks({
          datasetId: dataset.sourceFileId,
          columnName: visualization.mapping.valueColumn,
          method: storeMethod,
          numClasses: requestedClassCount
        });
      }

      if (myRequestId !== breaksRequestId) return;

      applyBreaksResult(storeMethod, requestedClassCount, result);
    } finally {
      _isCalculating = false;
    }
  }

  function handleMethodChange(method: PanelMethod) {
    currentMethod = method;
    if (method !== 'head-tail') {
      headTailClassCountMax = DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;
    }
    computeBreaks();
  }

  function handleClassesChange(num: number) {
    currentNumClasses = num;
    computeBreaks();
  }

  function handleBreakpointChange(value: number | null) {
    currentBreakpoint = value;
    computeBreaks();
  }

  function handleBreaksChange(breaks: ClassBreak[]) {
    currentBreaks = breaks;
    computeBreaks();
  }

  function handleClose() {
    syncStateFromVisualization(activeClassification);
    panelRenderKey += 1;
    wasOpen = false;
    open = false;
    onclose?.();
  }
</script>

{#if open}
  <aside
    class="discretization-floating-panel"
    style:right={panelRight}
    aria-label={m.discretization()}
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
    <div class="panel-body" aria-busy={_isCalculating}>
      {#key panelRenderKey}
        <DiscretizationPanel
          bind:method={currentMethod}
          bind:numClasses={currentNumClasses}
          bind:breaks={currentBreaks}
          bind:breakpointValue={currentBreakpoint}
          divergingPreviewColors={divergingPreview}
          classCountMax={currentMethod === 'head-tail'
            ? headTailClassCountMax
            : DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX}
          onmethodchange={handleMethodChange}
          onclasseschange={handleClassesChange}
          onbreakpointchange={handleBreakpointChange}
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
    max-height: calc(100dvh - 120px);
    z-index: var(--z-dropdown);
    background: var(--cds-ui-02, #ffffff);
    border: 1px solid var(--cds-border-subtle, #e0e0e0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--cds-spacing-04) var(--cds-spacing-05);
    border-bottom: 1px solid var(--cds-border-subtle);
    position: sticky;
    top: 0;
    flex-shrink: 0;
    background: var(--cds-ui-02, #ffffff);
    z-index: 1;

    h3 {
      font-size: 1rem;
      font-weight: 600;
      margin: 0;
      color: var(--cds-text-01);
    }
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
  }
</style>
