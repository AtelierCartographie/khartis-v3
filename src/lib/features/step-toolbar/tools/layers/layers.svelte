<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { ColorPalette, Earth } from 'carbon-icons-svelte';
  import LayersList from './layers-list.svelte';
  import { layersActions, layersState } from './layers.store.svelte';
  import type { Layer } from './layers.types.js';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { basemapLayersStore } from '$lib/features/map/stores/basemap-layers.store.svelte';
  import { globalActions } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';

  const store = layersActions;
  const currentState = $derived(layersState);

  $effect(() => {
    void visualizationStore.version;
    void basemapLayersStore.version;
    store.syncWithVisualizations();
  });

  let layers = $derived(
    currentState.layers.map((l: Layer) => ({
      ...l,
      icon: l.isSubLayer
        ? l.type === 'geographic'
          ? Earth
          : ColorPalette
        : undefined
    }))
  );

  const parentLayers = $derived(layers.filter((layer) => !layer.isSubLayer));

  const childLayersByParent = $derived.by(() => {
    const children: Record<string, Layer[]> = {};

    for (const layer of layers) {
      if (!layer.isSubLayer || !layer.parentId) continue;

      if (!children[layer.parentId]) {
        children[layer.parentId] = [];
      }
      children[layer.parentId].push(layer);
    }

    for (const parentId of Object.keys(children)) {
      children[parentId].sort((a, b) => a.order - b.order);
    }

    return children;
  });

  function handleToggleVisibility(layerId: string): void {
    store.toggleLayerVisibility(layerId);
  }

  function handleOpenSettings(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;

    if (layer.type === 'geographic') return;

    const targetVisualizationId = layer.isSubLayer ? layer.parentId : layer.id;
    if (!targetVisualizationId) return;

    visualizationStore.selectVisualization(targetVisualizationId);
    globalActions.setNavigationState(ToolbarStep.Visualizations);

    setTimeout(() => {
      const configureSection = document.querySelector(
        '#khartis-viz-tab > div:nth-child(2)'
      );
      configureSection?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 100);
  }

  function handleRenameLayer(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.isSubLayer) return;

    const newName = prompt(m.layers_rename_prompt(), layer.name);
    if (newName && newName.trim() !== '') {
      store.updateLayer(layerId, { name: newName.trim() });
    }
  }

  function handleDuplicateLayer(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.isSubLayer) return;
    store.duplicateLayer(layerId);
  }

  function handleDeleteLayer(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.isSubLayer) return;
    if (confirm(m.layers_delete_confirm())) {
      store.removeLayer(layerId);
    }
  }

  function handleReorderLayers(dragIndex: number, hoverIndex: number): void {
    store.reorderLayers('visualization', dragIndex, hoverIndex);
  }
</script>

<div id="khartis-layers-tool">
  <p class="description">{m.layers_description()}</p>

  <LayersList
    layers={parentLayers}
    childLayersByParent={childLayersByParent}
    onToggleVisibility={handleToggleVisibility}
    onOpenSettings={handleOpenSettings}
    onRenameLayer={handleRenameLayer}
    onDuplicateLayer={handleDuplicateLayer}
    onDeleteLayer={handleDeleteLayer}
    onReorderLayer={handleReorderLayers}
  />
</div>

<style>
  .description {
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-helper);
    margin-bottom: var(--cds-spacing-05);
  }
</style>
