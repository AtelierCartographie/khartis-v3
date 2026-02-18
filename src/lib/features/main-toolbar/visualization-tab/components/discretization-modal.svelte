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
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

  type PanelMethod =
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
      [ClassificationMethod.STANDARD_DEVIATION]: 'stddev',
      [ClassificationMethod.MANUAL]: 'manual'
    };
    return mapping[method] ?? 'quantile';
  }

  function panelMethodToStoreMethod(method: PanelMethod): ClassificationMethod {
    const mapping: Record<PanelMethod, ClassificationMethod> = {
      jenks: ClassificationMethod.JENKS,
      quantile: ClassificationMethod.QUANTILES,
      'equal-interval': ClassificationMethod.EQUAL_INTERVAL,
      stddev: ClassificationMethod.STANDARD_DEVIATION,
      manual: ClassificationMethod.MANUAL
    };
    return mapping[method] ?? ClassificationMethod.QUANTILES;
  }

  let currentMethod = $state<PanelMethod>('quantile');
  let currentNumClasses = $state(5);
  let currentBreaks = $state<ClassBreak[]>([]);
  let currentBreakpoint = $state<number | null>(null);

  $effect(() => {
    if (visualization?.classification) {
      currentMethod = storeMethodToPanelMethod(
        visualization.classification.method ?? ClassificationMethod.QUANTILES
      );
      currentNumClasses =
        visualization.classification.numClasses ??
        visualization.classification.classes ??
        5;
      currentBreakpoint = visualization.classification.breakpointValue ?? null;
    }
  });

  $effect(() => {
    if (
      open &&
      visualization?.datasetId &&
      visualization?.mapping.valueColumn
    ) {
      computeBreaks();
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
      const result = await calculateBreaks({
        datasetId: dataset.sourceFileId,
        columnName: visualization.mapping.valueColumn,
        method: panelMethodToStoreMethod(currentMethod),
        numClasses: currentNumClasses
      });

      if (result) {
        const paletteType =
          currentBreakpoint !== null ? 'diverging' : 'sequential';
        const colors = generateColorsForBreaks(currentNumClasses, paletteType);
        const allBreaks = [result.min, ...result.breaks, result.max];

        currentBreaks = result.counts.map((count, i) => ({
          min: allBreaks[i],
          max: allBreaks[i + 1],
          count,
          color: colors[i] || colors[colors.length - 1]
        }));

        onchange?.({
          method: panelMethodToStoreMethod(currentMethod),
          classes: currentNumClasses,
          numClasses: currentNumClasses,
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
    onmethodchange={handleMethodChange}
    onclasseschange={handleClassesChange}
    onbreakpointchange={handleBreakpointChange}
    onbreakschange={handleBreaksChange}
  />
</Modal>
