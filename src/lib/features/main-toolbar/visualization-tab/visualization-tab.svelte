<script lang="ts">
  import {
    visualizationStore,
    VisualizationType
  } from '$lib/features/commons/store/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import ChooseVisualization from './choose-visualization.svelte';
  import ConfigureVisualization from './configure-visualization.svelte';
  import CustomizeBasemap from './customize-basemap.svelte';
  import ToolbarTabLayout from '../components/toolbar-tab-layout.svelte';

  let configureSection: HTMLElement | undefined = $state();
  let hasAutoCreated = $state(false);


  function handleCreateVisualization() {
    if (configureSection) {
      configureSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  $effect(() => {
    const dataset = datasetsStore.selectedDataset;
    const hasNoViz = visualizationStore.visualizations.length === 0;

    if (dataset && hasNoViz && !hasAutoCreated) {
      hasAutoCreated = true;
      const defaultType = dataset.geometry?.type
        ?.toLowerCase()
        .includes('point')
        ? VisualizationType.PROPORTIONAL
        : VisualizationType.CHOROPLETH;
      visualizationStore.createVisualization(defaultType, dataset.id);
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
