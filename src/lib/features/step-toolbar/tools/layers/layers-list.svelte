<script lang="ts">
  import LayerItem from './layer-item.svelte';
  import type { DragState, Layer } from './layers.types.js';
  import { resetDragState } from './layers.utils.js';

  interface Props {
    layers: readonly Layer[];
    childLayersByParent?: Record<string, Layer[]>;
    onToggleVisibility: (layerId: string) => void;
    onOpenSettings: (layerId: string) => void;
    onReorderLayer?: (dragIndex: number, hoverIndex: number) => void;
    onRenameLayer?: (layerId: string) => void;
    onDuplicateLayer?: (layerId: string) => void;
    onDeleteLayer?: (layerId: string) => void;
  }

  const {
    layers,
    childLayersByParent = {},
    onToggleVisibility,
    onOpenSettings,
    onReorderLayer,
    onRenameLayer,
    onDuplicateLayer,
    onDeleteLayer
  }: Props = $props();

  let dragState = $state<DragState>({
    dragIndex: null,
    dragOverIndex: null
  });

  function handleDragStart(index: number): void {
    dragState.dragIndex = index;
  }

  function handleDragOver(index: number): void {
    dragState.dragOverIndex = index;
  }

  function handleDragEnd(): void {
    const { dragIndex, dragOverIndex } = dragState;

    if (
      dragIndex !== null &&
      dragOverIndex !== null &&
      dragIndex !== dragOverIndex
    ) {
      onReorderLayer?.(dragIndex, dragOverIndex);
    }

    resetDragState((state: DragState) => (dragState = state));
  }

  function handleDragLeave(): void {
    dragState.dragOverIndex = null;
  }

  function getChildLayers(parentId: string): Layer[] {
    return childLayersByParent[parentId] ?? [];
  }
</script>

<div class="layers-container" role="list">
  {#each layers as layer, index (layer.id)}
    <LayerItem
      layer={layer}
      index={index}
      onToggleVisibility={onToggleVisibility}
      onOpenSettings={onOpenSettings}
      onRenameLayer={onRenameLayer}
      onDuplicateLayer={onDuplicateLayer}
      onDeleteLayer={onDeleteLayer}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragLeave={handleDragLeave}
      isDragging={dragState.dragIndex === index}
      isDragOver={dragState.dragOverIndex === index}
    />

    {#if getChildLayers(layer.id).length > 0}
      <div class="sublayers-container">
        <div class="sublayers-line"></div>
        <div class="sublayers-list">
          {#each getChildLayers(layer.id) as childLayer, childIndex (childLayer.id)}
            <LayerItem
              layer={childLayer}
              index={childIndex}
              onToggleVisibility={onToggleVisibility}
              onOpenSettings={onOpenSettings}
              onDragStart={() => {}}
              onDragOver={() => {}}
              onDragEnd={() => {}}
              onDragLeave={() => {}}
              isDragging={false}
              isDragOver={false}
            />
          {/each}
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .layers-container {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sublayers-container {
    display: flex;
    gap: var(--cds-spacing-03);
    padding-left: var(--cds-spacing-05);
  }

  .sublayers-line {
    width: 1px;
    background-color: var(--cds-border-subtle);
    flex-shrink: 0;
  }

  .sublayers-list {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-03);
  }
</style>
