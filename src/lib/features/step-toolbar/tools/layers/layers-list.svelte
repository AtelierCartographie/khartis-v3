<script lang="ts">
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import LayerItem from './layer-item.svelte';
  import type { DragState, Layer } from './layers.types.js';
  import { resetDragState } from './layers.utils.js';

  interface Props {
    layers: readonly Layer[];
    isSubSection?: boolean;
    onToggleVisibility: (layerId: string) => void;
    onOpenSettings: (layerId: string) => void;
    onReorderLayer?: (dragIndex: number, hoverIndex: number) => void;
  }

  const {
    layers,
    isSubSection = false,
    onToggleVisibility,
    onOpenSettings,
    onReorderLayer
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
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragLeave={handleDragLeave}
            isDragging={dragState.dragIndex === index}
            isDragOver={dragState.dragOverIndex === index}
          />
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
</style>
