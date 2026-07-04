<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Modal, TextInput } from 'carbon-components-svelte';
  import LayersList from './layers-list.svelte';
  import { layersActions, layersState } from './layers.store.svelte';
  import {
    readCarbonStringValue,
    type CarbonValueEvent
  } from '$lib/features/commons/utils/carbon-events.utils';
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
  import { tick } from 'svelte';
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

  function getVisualizationName(visualizationId: string): string {
    return (
      visualizationStore.visualizations.find((v) => v.id === visualizationId)
        ?.name ?? ''
    );
  }

  function handleRenameLayer(visualizationId: string): void {
    renameLayerId = visualizationId;
    renameValue = getVisualizationName(visualizationId);
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

  function handleRenameValueInput(event: CarbonValueEvent): void {
    renameValue = readCarbonStringValue(event, renameValue);
  }

  function handleDuplicateLayer(visualizationId: string): void {
    store.duplicateLayer(visualizationId);
  }

  function handleDeleteLayer(visualizationId: string): void {
    deleteLayerId = visualizationId;
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

  function handleReorder(fromIndex: number, toIndex: number): void {
    store.reorderLayers(fromIndex, toIndex);
  }

  function handleMoveLayer(layerId: string, direction: -1 | 1): void {
    const fromIndex = layers.findIndex((layer) => layer.id === layerId);
    const toIndex = fromIndex + direction;

    if (
      fromIndex === -1 ||
      toIndex < 0 ||
      toIndex >= layers.length ||
      fromIndex === toIndex
    ) {
      return;
    }

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
    value={renameValue}
    bind:ref={renameInputRef}
    on:input={handleRenameValueInput}
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
