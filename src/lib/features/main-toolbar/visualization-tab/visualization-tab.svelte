<script lang="ts">
  import { dataOrchestratorService } from '$lib/features/commons/services/data-orchestrator.service.svelte';
  import { dataTabState } from '$lib/features/commons/store/data-tab.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import ChooseVisualization from './choose-visualization.svelte';
  import ConfigureVisualization from './configure-visualization.svelte';
  import CustomizeBasemap from './customize-basemap.svelte';
  import { syncProjectOSMBasemap } from './osm-basemap-sync';
  import ToolbarTabLayout from '../components/toolbar-tab-layout.svelte';
  import {
    applyBlankVisualizationPreset,
    resolveBlankVisualizationType
  } from './suggestion.service';
  import {
    resolveRelevantPersistedBasemap,
    type PersistedProjectBasemap
  } from '../data-tab/services/persisted-basemap';

  let configureSection: HTMLElement | undefined = $state();
  /** Datasets for which we already auto-created (or found existing) visualizations.
   *  Prevents re-creation after the user explicitly deletes the last viz. */
  const initializedDatasetIds = new SvelteSet<string>();

  function handleCreateVisualization() {
    if (configureSection) {
      configureSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  $effect(() => {
    if (dataOrchestratorService.isProjectRestoreInProgress) return;

    const dataset = datasetsStore.selectedDataset;
    if (!dataset) return;

    const datasetVisualizations = visualizationStore.getVisualizationsByDataset(
      dataset.id
    );

    if (datasetVisualizations.length > 0) {
      initializedDatasetIds.add(dataset.id);
      return;
    }

    // Don't re-create if this dataset already had a viz (user deleted it)
    if (initializedDatasetIds.has(dataset.id)) return;
    initializedDatasetIds.add(dataset.id);

    const defaultType = resolveBlankVisualizationType(dataset);
    const visualization = visualizationStore.createVisualization(
      defaultType,
      dataset.id
    );
    applyBlankVisualizationPreset(visualization.id, dataset, {
      mode: 'auto-suggestion'
    });
  });

  $effect(() => {
    const currentBasemap = resolveRelevantPersistedBasemap({
      selectedDataset: datasetsStore.selectedDataset,
      sourceFiles: projectStore.currentProject?.data?.sourceFiles,
      projectBasemap:
        (projectStore.currentProject?.data?.basemap as
          | PersistedProjectBasemap
          | undefined) ?? undefined,
      selectedBasemapId: dataTabState.basemapJoin.selectedBasemap,
      selectedBasemapSource: dataTabState.basemapJoin.basemapSource,
      hasMultipleDatasets: datasetsStore.datasets.length > 1
    });
    syncProjectOSMBasemap(
      currentBasemap,
      basemapCatalogService,
      osmBasemapStore
    );
  });
</script>

<ToolbarTabLayout id="khartis-viz-tab">
  <ChooseVisualization onCreateVisualization={handleCreateVisualization} />

  <div bind:this={configureSection}>
    <ConfigureVisualization />
  </div>

  <CustomizeBasemap />
</ToolbarTabLayout>
