<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    visualizationStore,
    type VisualizationConfig,
    type VisualizationModes,
    type MissingDataConfig
  } from '$lib/features/commons/store/visualization.store.svelte';
  import MainToolBarHeader from '../components/main-toolbar-header.svelte';
  import FillConfig from './components/fill-config.svelte';
  import LabelsConfig from './components/labels-config.svelte';
  import LinesConfig from './components/lines-config.svelte';
  import PolygonsConfig from './components/polygons-config.svelte';
  import SymbolsConfig from './components/symbols-config.svelte';
  import TextsConfig from './components/texts-config.svelte';

  let selectedViz = $derived(visualizationStore.selectedVisualization);

  const dataFieldItems = $derived.by(() => {
    const dataset = datasetsStore.selectedDataset;
    if (!dataset?.columns) return [];
    return dataset.columns
      .filter((col) => col.type !== 'geometry')
      .map((col, id) => ({ id, text: col.name }));
  });

  const discretizationMethods = [
    { id: 0, text: m.discretization_method_jenks() },
    { id: 1, text: m.discretization_method_quantile() },
    { id: 2, text: m.discretization_method_equal_interval() },
    { id: 3, text: m.discretization_method_manual() }
  ];

  function handleInvertPalette() {
    if (selectedViz?.id) {
      visualizationStore.invertPalette(selectedViz.id);
    }
  }

  function handleStyleChange(updates: Partial<VisualizationConfig['style']>) {
    if (selectedViz?.id) {
      visualizationStore.updateVisualization(selectedViz.id, {
        style: { ...selectedViz.style, ...updates }
      });
    }
  }

  function handleModesChange(updates: Partial<VisualizationModes>) {
    if (selectedViz?.id) {
      visualizationStore.updateModes(selectedViz.id, updates);
    }
  }

  function handleSymbolsChange(
    updates: Partial<VisualizationConfig['symbols']>
  ) {
    if (selectedViz?.id) {
      visualizationStore.updateSymbols(selectedViz.id, updates);
    }
  }

  function handleMissingDataChange(updates: Partial<MissingDataConfig>) {
    if (selectedViz?.id) {
      visualizationStore.updateMissingData(selectedViz.id, updates);
    }
  }
</script>

<section id="configure-visualization">
  <MainToolBarHeader title={m.step2_title()} />

  <p class="kh-help">
    {m.step2_description()}
  </p>

  <SymbolsConfig
    dataFields={dataFieldItems}
    visualization={selectedViz}
    onStyleChange={handleStyleChange}
    onModesChange={handleModesChange}
    onSymbolsChange={handleSymbolsChange}
    onMissingDataChange={handleMissingDataChange}
    onInvertPalette={handleInvertPalette}
  />

  <FillConfig
    dataFields={dataFieldItems}
    discretizationMethods={discretizationMethods}
    visualization={selectedViz}
    onStyleChange={handleStyleChange}
    onInvertPalette={handleInvertPalette}
  />

  <PolygonsConfig
    dataFields={dataFieldItems}
    discretizationMethods={discretizationMethods}
    visualization={selectedViz}
    onStyleChange={handleStyleChange}
    onModesChange={handleModesChange}
    onMissingDataChange={handleMissingDataChange}
    onInvertPalette={handleInvertPalette}
  />

  <LinesConfig
    dataFields={dataFieldItems}
    visualization={selectedViz}
    onStyleChange={handleStyleChange}
    onModesChange={handleModesChange}
    onMissingDataChange={handleMissingDataChange}
    onInvertPalette={handleInvertPalette}
  />

  <LabelsConfig
    dataFields={dataFieldItems}
    visualization={selectedViz}
    onStyleChange={handleStyleChange}
  />

  <TextsConfig
    dataFields={dataFieldItems}
    visualization={selectedViz}
    onStyleChange={handleStyleChange}
  />
</section>

<style lang="scss">
  #configure-visualization {
    background-color: var(--cds-ui-02);
    padding: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
