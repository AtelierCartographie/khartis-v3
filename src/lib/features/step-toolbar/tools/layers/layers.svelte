<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Modal, TextInput } from 'carbon-components-svelte';
  import { ColorPalette, Earth } from 'carbon-icons-svelte';
  import { tick } from 'svelte';
  import LayersList from './layers-list.svelte';
  import { layersActions, layersState } from './layers.store.svelte';
  import type { Layer, LayerReorderScope } from './layers.types.js';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { basemapLayersStore } from '$lib/features/map/stores/basemap-layers.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import {
    globalActions,
    globalState
  } from '$lib/features/commons/store/global.svelte';
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
        : l.type === 'visualization'
          ? ColorPalette
          : Earth
    }))
  );

  const parentLayers = $derived(layers.filter((layer) => !layer.isSubLayer));
  const hasActiveTiledBasemap = $derived(
    basemapStyleStore.requiresMapLibre || osmBasemapStore.isActive
  );
  const basemapForegroundParentLayers = $derived(
    hasActiveTiledBasemap
      ? []
      : parentLayers.filter(
          (layer) => layer.basemapRenderGroup === 'foreground'
        )
  );
  const visualizationParentLayers = $derived(
    parentLayers.filter((layer) => layer.type === 'visualization')
  );
  const basemapBackgroundParentLayers = $derived(
    hasActiveTiledBasemap
      ? []
      : parentLayers.filter(
          (layer) => layer.basemapRenderGroup === 'background'
        )
  );

  const childLayersByParent = $derived.by(() => {
    const children: Record<string, Layer[]> = {};

    for (const layer of layers) {
      if (
        !layer.isSubLayer ||
        !layer.parentId ||
        layer.type !== 'visualization'
      ) {
        continue;
      }

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
    const layer = layers.find((l) => l.id === layerId);
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
    const layer = layers.find((l) => l.id === layerId);
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
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.isSubLayer) return;
    store.duplicateLayer(layerId);
  }

  function handleDeleteLayer(layerId: string): void {
    const layer = layers.find((l) => l.id === layerId);
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

  function getParentLayersForScope(scope: LayerReorderScope): Layer[] {
    switch (scope) {
      case 'visualization':
        return visualizationParentLayers;
      case 'geographic-background':
        return basemapBackgroundParentLayers;
      case 'geographic-foreground':
        return basemapForegroundParentLayers;
    }
  }

  function handleMoveLayer(
    scope: LayerReorderScope,
    layerId: string,
    direction: -1 | 1
  ): void {
    const scopedLayers = getParentLayersForScope(scope);
    const fromIndex = scopedLayers.findIndex((layer) => layer.id === layerId);
    const toIndex = fromIndex + direction;

    if (
      fromIndex === -1 ||
      toIndex < 0 ||
      toIndex >= scopedLayers.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    store.reorderLayers(scope, fromIndex, toIndex);
  }

  function handleMoveSubLayer(
    parentId: string,
    layerId: string,
    direction: -1 | 1
  ): void {
    const childLayers = childLayersByParent[parentId] ?? [];
    const fromIndex = childLayers.findIndex((layer) => layer.id === layerId);
    const toIndex = fromIndex + direction;

    if (
      fromIndex === -1 ||
      toIndex < 0 ||
      toIndex >= childLayers.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    store.reorderSubLayers(parentId, fromIndex, toIndex);
  }
</script>

<div class="layers-tool">
  <p class="description">{m.layers_description()}</p>
  {#if hasActiveTiledBasemap}
    <p class="description description--tiled">{m.basemap_tiled_info()}</p>
  {/if}

  {#if basemapForegroundParentLayers.length > 0}
    <section
      class="layer-section"
      aria-label={m.layers_section_foreground_title()}
    >
      <div class="section-header">
        <div class="section-heading">
          <h4 class="section-title">{m.layers_section_foreground_title()}</h4>
          <span class="section-badge section-badge--global">
            {m.layers_section_badge_global()}
          </span>
        </div>
        <p class="section-help">{m.layers_section_foreground_description()}</p>
      </div>

      <LayersList
        parentLayers={basemapForegroundParentLayers}
        childLayersByParent={{}}
        reorderScope="geographic-foreground"
        onToggleVisibility={handleToggleVisibility}
        onOpenSettings={handleOpenSettings}
        onReorderLayers={handleReorderLayers}
        onReorderSubLayers={handleReorderSubLayers}
        onMoveLayer={handleMoveLayer}
        onMoveSubLayer={handleMoveSubLayer}
        onRenameLayer={handleRenameLayer}
        onDuplicateLayer={handleDuplicateLayer}
        onDeleteLayer={handleDeleteLayer}
      />
    </section>
  {/if}

  {#if visualizationParentLayers.length > 0}
    <section
      class="layer-section"
      aria-label={m.layers_section_visualizations_title()}
    >
      <div class="section-header">
        <div class="section-heading">
          <h4 class="section-title">
            {m.layers_section_visualizations_title()}
          </h4>
          <span class="section-badge section-badge--reorderable">
            {m.layers_section_badge_reorderable()}
          </span>
        </div>
        <p class="section-help">
          {m.layers_section_visualizations_description()}
        </p>
      </div>

      <LayersList
        parentLayers={visualizationParentLayers}
        childLayersByParent={childLayersByParent}
        reorderScope="visualization"
        onToggleVisibility={handleToggleVisibility}
        onOpenSettings={handleOpenSettings}
        onReorderLayers={handleReorderLayers}
        onReorderSubLayers={handleReorderSubLayers}
        onMoveLayer={handleMoveLayer}
        onMoveSubLayer={handleMoveSubLayer}
        onRenameLayer={handleRenameLayer}
        onDuplicateLayer={handleDuplicateLayer}
        onDeleteLayer={handleDeleteLayer}
      />
    </section>
  {/if}

  {#if basemapBackgroundParentLayers.length > 0}
    <section
      class="layer-section"
      aria-label={m.layers_section_background_title()}
    >
      <div class="section-header">
        <div class="section-heading">
          <h4 class="section-title">{m.layers_section_background_title()}</h4>
          <span class="section-badge section-badge--global">
            {m.layers_section_badge_global()}
          </span>
        </div>
        <p class="section-help">{m.layers_section_background_description()}</p>
      </div>

      <LayersList
        parentLayers={basemapBackgroundParentLayers}
        childLayersByParent={{}}
        reorderScope="geographic-background"
        onToggleVisibility={handleToggleVisibility}
        onOpenSettings={handleOpenSettings}
        onReorderLayers={handleReorderLayers}
        onReorderSubLayers={handleReorderSubLayers}
        onMoveLayer={handleMoveLayer}
        onMoveSubLayer={handleMoveSubLayer}
        onRenameLayer={handleRenameLayer}
        onDuplicateLayer={handleDuplicateLayer}
        onDeleteLayer={handleDeleteLayer}
      />
    </section>
  {/if}
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

  .layer-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .layer-section + .layer-section {
    padding-top: var(--cds-spacing-05);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .section-header {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    flex-wrap: wrap;
  }

  .section-title {
    margin: 0;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    font-weight: 600;
    color: var(--cds-text-primary);
  }

  .section-help {
    margin: 0;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary);
  }

  .section-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 11px;
    line-height: 1;
    letter-spacing: 0.32px;
    font-weight: 600;
    white-space: nowrap;
  }

  .section-badge--global {
    background: var(--cds-button-primary);
    color: var(--cds-text-on-color);
  }

  .section-badge--reorderable {
    background: var(--cds-layer-hover);
    border-color: var(--cds-border-subtle);
    color: var(--cds-text-secondary);
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
