<script lang="ts">
  import { Modal } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import DiscretizationPanel from './discretization-panel.svelte';
  import {
    ClassificationMethod,
    type ClassificationConfig,
    type VisualizationConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import {
    calculateBreaks,
    generateColorsForBreaks
  } from '$lib/features/commons/services/classification.service';
  import { getColorBlindnessState } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { untrack } from 'svelte';
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
    onclose?: () => void;
    onchange?: (classification: Partial<ClassificationConfig>) => void;
  }

  let {
    open = $bindable(false),
    visualization,
    onclose,
    onchange
  }: Props = $props();

  let _isCalculating = $state(false);

  function storeMethodToPanelMethod(method: ClassificationMethod): PanelMethod {
    const mapping: Record<ClassificationMethod, PanelMethod> = {
      [ClassificationMethod.JENKS]: 'jenks',
      [ClassificationMethod.QUANTILES]: 'quantile',
      [ClassificationMethod.EQUAL_INTERVAL]: 'equal-interval',
      [ClassificationMethod.STANDARD_DEVIATION]: 'nested-means',
      [ClassificationMethod.MANUAL]: 'manual',
      [ClassificationMethod.Q6]: 'q6',
      [ClassificationMethod.NESTED_MEANS]: 'nested-means',
      [ClassificationMethod.HEAD_TAIL]: 'head-tail'
    };
    return mapping[method] ?? 'quantile';
  }

  function panelMethodToStoreMethod(method: PanelMethod): ClassificationMethod {
    const mapping: Record<PanelMethod, ClassificationMethod> = {
      jenks: ClassificationMethod.JENKS,
      quantile: ClassificationMethod.QUANTILES,
      'equal-interval': ClassificationMethod.EQUAL_INTERVAL,
      manual: ClassificationMethod.MANUAL,
      q6: ClassificationMethod.Q6,
      'nested-means': ClassificationMethod.NESTED_MEANS,
      'head-tail': ClassificationMethod.HEAD_TAIL
    };
    return mapping[method] ?? ClassificationMethod.QUANTILES;
  }

  let currentMethod = $state<PanelMethod>('quantile');
  let currentNumClasses = $state(5);
  let currentBreaks = $state<ClassBreak[]>([]);
  let currentBreakpoint = $state<number | null>(null);
  let headTailClassCountMax = $state(DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX);

  $effect(() => {
    if (visualization?.classification) {
      const method = normalizeClassificationMethod(
        visualization.classification.method ?? ClassificationMethod.QUANTILES
      );
      const storedNumClasses =
        visualization.classification.numClasses ??
        visualization.classification.classes ??
        5;
      const actualClassCount = visualization.classification.counts?.length;

      currentMethod = storeMethodToPanelMethod(method);
      currentNumClasses = resolveComputedClassCount(
        method,
        storedNumClasses,
        actualClassCount ?? storedNumClasses
      );
      currentBreakpoint = visualization.classification.breakpointValue ?? null;
      headTailClassCountMax =
        method === ClassificationMethod.HEAD_TAIL
          ? resolveHeadTailClassCountMax(actualClassCount ?? storedNumClasses)
          : DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;
    }
  });

  $effect(() => {
    if (
      open &&
      visualization?.datasetId &&
      visualization?.mapping.valueColumn
    ) {
      untrack(() => computeBreaks());
    }
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

    _isCalculating = true;
    try {
      const storeMethod = panelMethodToStoreMethod(currentMethod);
      const requestedClassCount = resolveRequestedClassCount(
        storeMethod,
        currentNumClasses
      );
      const result = await calculateBreaks({
        datasetId: dataset.sourceFileId,
        columnName: visualization.mapping.valueColumn,
        method: storeMethod,
        numClasses: requestedClassCount
      });

      if (result) {
        const actualClassCount = result.counts.length;
        const resolvedClassCount = resolveComputedClassCount(
          storeMethod,
          requestedClassCount,
          actualClassCount
        );
        const paletteType =
          currentBreakpoint !== null ? 'diverging' : 'sequential';
        const cbState = getColorBlindnessState();
        const contrast = cbState.enabled ? ('high' as const) : undefined;
        const colors = generateColorsForBreaks(
          resolvedClassCount,
          paletteType,
          contrast
        );
        const allBreaks = [result.min, ...result.breaks, result.max];

        currentNumClasses = resolvedClassCount;
        currentBreaks = result.counts.map((count, i) => ({
          min: allBreaks[i],
          max: allBreaks[i + 1],
          count,
          color: colors[i] || colors[colors.length - 1]
        }));
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
          breakpointValue: currentBreakpoint
        });
      }
    } finally {
      _isCalculating = false;
    }
  }

  function handleMethodChange(method: PanelMethod) {
    currentMethod = method;
    if (method !== 'head-tail') {
      headTailClassCountMax = DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX;
    }
    if (method !== 'manual') {
      computeBreaks();
    } else {
      notifyChange();
    }
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
    const breakValues = breaks.slice(0, -1).map((b) => b.max);
    const countValues = breaks.map((b) => b.count);
    onchange?.({
      method: panelMethodToStoreMethod(currentMethod),
      classes: currentNumClasses,
      numClasses: currentNumClasses,
      breaks: breakValues,
      counts: countValues,
      breakpointValue: currentBreakpoint
    });
  }

  function notifyChange() {
    onchange?.({
      method: panelMethodToStoreMethod(currentMethod),
      classes: currentNumClasses,
      numClasses: currentNumClasses,
      breakpointValue: currentBreakpoint
    });
  }

  function handleClose() {
    open = false;
    onclose?.();
  }
</script>

<Modal
  bind:open={open}
  modalHeading={m.discretization()}
  passiveModal
  size="sm"
  on:close={handleClose}
>
  <DiscretizationPanel
    bind:method={currentMethod}
    bind:numClasses={currentNumClasses}
    bind:breaks={currentBreaks}
    bind:breakpointValue={currentBreakpoint}
    classCountMax={currentMethod === 'head-tail'
      ? headTailClassCountMax
      : DEFAULT_DISCRETIZATION_CLASS_COUNT_MAX}
    onmethodchange={handleMethodChange}
    onclasseschange={handleClassesChange}
    onbreakpointchange={handleBreakpointChange}
    onbreakschange={handleBreaksChange}
  />
</Modal>
