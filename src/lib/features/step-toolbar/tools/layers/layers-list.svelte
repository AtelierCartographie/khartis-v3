<script lang="ts">
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import LayerItem from './layer-item.svelte';
  import type { DragState, Layer } from './layers.types.js';
  import { resetDragState } from './layers.utils.js';

  interface Props {
    layers: readonly Layer[];
    childLayersByParent?: Record<string, Layer[]>;
    isSubSection?: boolean;
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
    isSubSection = false,
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

<div class="layers-container" class:sub-section={isSubSection}>
  <Grid noGutter>
    {#each layers as layer, index (layer.id)}
      <Row>
        <Column>
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
            <div class="child-layers">
              {#each getChildLayers(layer.id) as childLayer, childIndex (childLayer.id)}
                <LayerItem
                  layer={childLayer}
                  index={childIndex}
                  onToggleVisibility={onToggleVisibility}
                  onOpenSettings={onOpenSettings}
                  onRenameLayer={onRenameLayer}
                  onDuplicateLayer={onDuplicateLayer}
                  onDeleteLayer={onDeleteLayer}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDragLeave={handleDragLeave}
                  isDragging={false}
                  isDragOver={false}
                />
              {/each}
            </div>
          {/if}
        </Column>
      </Row>
    {/each}
  </Grid>
</div>

<style>
  .layers-container.sub-section {
    padding-left: var(--cds-spacing-04);
    border-left: 1px solid var(--cds-border-subtle);
  }

  .child-layers {
    padding-left: var(--cds-spacing-05);
  }
</style>
