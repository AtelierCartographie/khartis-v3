<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Modal, TextInput } from 'carbon-components-svelte';
  import LayersList from './layers-list.svelte';
  import { layersActions, layersState } from './layers.store.svelte';
  import type { Layer, LayerReorderScope } from './layers.types.js';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { basemapLayersStore } from '$lib/features/map/stores/basemap-layers.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { shouldUseMapLibreInterleaved } from '$lib/features/map/utils/render-engine.utils';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { tick } from 'svelte';

  const store = layersActions;
  const currentState = $derived(layersState);

  $effect(() => {
    void visualizationStore.version;
    void basemapLayersStore.version;
    store.syncWithVisualizations();
  });

  const hasActiveTiledBasemap = $derived(
    shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive
    })
  );

  const layers = $derived(currentState.layers as Layer[]);
  const parentLayers = $derived(layers.filter((layer) => !layer.isSubLayer));

  const childLayersByParent = $derived.by(() => {
    const children: Record<string, Layer[]> = {};

    for (const layer of layers) {
      if (!layer.isSubLayer || !layer.parentId) continue;
      if (layer.type === 'geographic' && hasActiveTiledBasemap) continue;

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

  let renameModalOpen = $state(false);
  let renameLayerId = $state<string | null>(null);
  let renameValue = $state('');
  let renameInputRef = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!renameModalOpen) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    tick().then(() => {
      timer = setTimeout(() => {
        renameInputRef?.select();
        timer = null;
      }, 100);
    });
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  let deleteModalOpen = $state(false);
  let deleteLayerId = $state<string | null>(null);

  function handleToggleVisibility(layerId: string): void {
    store.toggleLayerVisibility(layerId);
  }

  function handleOpenSettings(layerId: string): void {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;

    globalState.selectedTool = undefined;
    globalActions.setNavigationState(ToolbarStep.Visualizations);

    if (layer.type === 'geographic') {
      setTimeout(() => {
        document
          .querySelector('#customize-basemap')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return;
    }

    const targetVisualizationId = layer.isSubLayer ? layer.parentId : layer.id;
    if (!targetVisualizationId) return;

    visualizationStore.selectVisualization(targetVisualizationId);

    setTimeout(() => {
      document
        .querySelector('#configure-visualization')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  function handleRenameLayer(layerId: string): void {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer || layer.isSubLayer) return;
    renameLayerId = layerId;
    renameValue = layer.name;
    renameModalOpen = true;
  }

  function handleRenameConfirm(): void {
    if (renameLayerId && renameValue.trim()) {
      store.updateLayer(renameLayerId, { name: renameValue.trim() });
    }
    renameModalOpen = false;
    renameLayerId = null;
    renameValue = '';
  }

  function handleRenameCancel(): void {
    renameModalOpen = false;
    renameLayerId = null;
    renameValue = '';
  }

  function handleDuplicateLayer(layerId: string): void {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer || layer.isSubLayer) return;
    store.duplicateLayer(layerId);
  }

  function handleDeleteLayer(layerId: string): void {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer || layer.isSubLayer) return;
    deleteLayerId = layerId;
    deleteModalOpen = true;
  }

  function handleDeleteConfirm(): void {
    if (deleteLayerId) {
      store.removeLayer(deleteLayerId);
    }
    deleteModalOpen = false;
    deleteLayerId = null;
  }

  function handleDeleteCancel(): void {
    deleteModalOpen = false;
    deleteLayerId = null;
  }

  function handleReorderLayers(
    scope: LayerReorderScope,
    fromIndex: number,
    toIndex: number
  ): void {
    store.reorderLayers(scope, fromIndex, toIndex);
  }

  function handleReorderSubLayers(
    parentId: string,
    fromIndex: number,
    toIndex: number
  ): void {
    store.reorderSubLayers(parentId, fromIndex, toIndex);
  }

  function handleMoveLayer(
    scope: LayerReorderScope,
    layerId: string,
    direction: -1 | 1
  ): void {
    const fromIndex = parentLayers.findIndex((layer) => layer.id === layerId);
    const toIndex = fromIndex + direction;

    if (
      fromIndex === -1 ||
      toIndex < 0 ||
      toIndex >= parentLayers.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    store.reorderLayers(scope, fromIndex, toIndex);
  }
</script>

<div class="layers-tool">
  <p class="description">{m.layers_description()}</p>
  {#if hasActiveTiledBasemap}
    <p class="description description--tiled">{m.basemap_tiled_info()}</p>
  {/if}

  <LayersList
    parentLayers={parentLayers}
    childLayersByParent={childLayersByParent}
    reorderScope="visualization"
    onToggleVisibility={handleToggleVisibility}
    onOpenSettings={handleOpenSettings}
    onReorderLayers={handleReorderLayers}
    onReorderSubLayers={handleReorderSubLayers}
    onMoveLayer={handleMoveLayer}
    onRenameLayer={handleRenameLayer}
    onDuplicateLayer={handleDuplicateLayer}
    onDeleteLayer={handleDeleteLayer}
  />
</div>

<Modal
  bind:open={renameModalOpen}
  modalHeading={m.layers_rename()}
  primaryButtonText={m.layers_rename()}
  secondaryButtonText={m.cancel()}
  primaryButtonDisabled={!renameValue.trim()}
  on:click:button--primary={handleRenameConfirm}
  on:click:button--secondary={handleRenameCancel}
  on:close={handleRenameCancel}
  on:submit={handleRenameConfirm}
  size="sm"
>
  <TextInput
    labelText={m.layers_rename_prompt()}
    bind:value={renameValue}
    bind:ref={renameInputRef}
  />
</Modal>

<Modal
  danger
  bind:open={deleteModalOpen}
  modalHeading={m.layers_delete()}
  primaryButtonText={m.layers_delete()}
  secondaryButtonText={m.cancel()}
  on:click:button--primary={handleDeleteConfirm}
  on:click:button--secondary={handleDeleteCancel}
  on:close={handleDeleteCancel}
  size="sm"
>
  <p>{m.layers_delete_confirm()}</p>
</Modal>

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
