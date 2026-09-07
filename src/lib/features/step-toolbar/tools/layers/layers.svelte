<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import LayersList from './layers-list.svelte';
  import { layersActions, layersState } from './layers.store.svelte';
  import type { Layer } from '../../types/layers.types';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { visualizationStore } from '$lib/features/commons/stores/visualization.store.svelte';
  import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';
  import {
    basemapAuxLayersStore,
    basemapLayersStore,
    basemapService,
    osmBasemapStore
  } from '$lib/features/map';
  import { globalActions } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { getLocale } from '$lib/paraglide/runtime.js';

  const store = layersActions;
  const currentState = $derived(layersState);

  $effect(() => {
    void getLocale();
    void visualizationStore.version;
    void basemapLayersStore.version;
    void basemapAuxLayersStore.version;
    void basemapStyleStore.referenceBasemapId;
    void basemapStyleStore.groupVisibilityVersion;
    void basemapStyleStore.styleVersion;
    void basemapStyleStore.lastSelectedTiledStyle;
    void osmBasemapStore.isActive;
    void basemapService.simplificationVersion;
    store.syncWithVisualizations();
  });

  const hasActiveTiledBasemap = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive
    })
  );

  const layers = $derived(currentState.layers as Layer[]);

  function handleToggleVisibility(layerId: string): void {
    store.toggleLayerVisibility(layerId);
  }

  function handleOpenSettings(layerId: string): void {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;

    globalActions.setSelectedTool(undefined);
    globalActions.setNavigationState(ToolbarStep.Visualizations);

    if (layer.kind === 'basemap-aux') {
      setTimeout(() => {
        document
          .querySelector('#customize-basemap')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return;
    }

    const targetVisualizationId = layer.parentId ?? layer.id;
    if (!targetVisualizationId) return;

    visualizationStore.selectVisualization(targetVisualizationId);

    setTimeout(() => {
      document
        .querySelector('#configure-visualization')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function handleReorder(fromIndex: number, toIndex: number): void {
    store.reorderLayers(fromIndex, toIndex);
  }
</script>

<div class="layers-tool">
  <p class="description">{m.layers_description()}</p>
  {#if hasActiveTiledBasemap}
    <p class="description description--tiled">{m.basemap_tiled_info()}</p>
  {/if}

  <LayersList
    layers={layers}
    onToggleVisibility={handleToggleVisibility}
    onOpenSettings={handleOpenSettings}
    onReorder={handleReorder}
  />
</div>

<style>
  .layers-tool {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .description {
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-helper);
    margin: 0;
  }

  .description--tiled {
    color: var(--cds-text-secondary);
  }
</style>
