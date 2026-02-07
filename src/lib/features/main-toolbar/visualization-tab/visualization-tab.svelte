<script lang="ts">
  import {
    visualizationStore,
    VisualizationType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import ChooseVisualization from './choose-visualization.svelte';
  import ConfigureVisualization from './configure-visualization.svelte';
  import CustomizeBasemap from './customize-basemap.svelte';
  import ToolbarTabLayout from '../components/toolbar-tab-layout.svelte';
  import { onMount } from 'svelte';

  let configureSection: HTMLElement | undefined = $state();
  let hasAutoCreated = $state(false);
  let lastSnapshot = $state<string>('');

  function handleCreateVisualization() {
    if (configureSection) {
      configureSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  onMount(() => {
    logger.info('[visualization-tab] mounted', LogCategory.UI);
    return () => {
      logger.warn('[visualization-tab] unmounted', LogCategory.UI, {
        selectedDatasetId: datasetsStore.selectedDataset?.id,
        visualizationsCount: visualizationStore.visualizations.length
      });
    };
  });

  $effect(() => {
    const dataset = datasetsStore.selectedDataset;
    const hasNoViz = visualizationStore.visualizations.length === 0;
    const snapshot = `${dataset?.id ?? 'none'}|${visualizationStore.visualizations.length}|${hasAutoCreated}`;

    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot;
      logger.debug(
        '[visualization-tab] auto-create check snapshot',
        LogCategory.UI,
        {
          selectedDatasetId: dataset?.id,
          hasNoViz,
          hasAutoCreated,
          selectedVisualizationId: visualizationStore.selectedVisualization?.id
        }
      );
    }

    if (dataset && hasNoViz && !hasAutoCreated) {
      hasAutoCreated = true;
      const defaultType = dataset.geometry?.type
        ?.toLowerCase()
        .includes('point')
        ? VisualizationType.PROPORTIONAL
        : VisualizationType.CHOROPLETH;
      visualizationStore.createVisualization(defaultType, dataset.id);
      logger.info(
        '[visualization-tab] auto-created default visualization',
        LogCategory.UI,
        {
          datasetId: dataset.id,
          defaultType
        }
      );
    }
  });
</script>

<ToolbarTabLayout id="khartis-viz-tab">
  <ChooseVisualization onCreateVisualization={handleCreateVisualization} />

  <div bind:this={configureSection}>
    <ConfigureVisualization />
  </div>

  <CustomizeBasemap />
</ToolbarTabLayout>
