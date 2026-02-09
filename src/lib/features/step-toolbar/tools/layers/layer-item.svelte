<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    OverflowMenu,
    OverflowMenuItem
  } from 'carbon-components-svelte';
  import {
    Draggable,
    Settings,
    ViewFilled,
    ViewOff
  } from 'carbon-icons-svelte';
  import type { Layer } from './layers.types.js';

  interface Props {
    layer: Layer;
    index: number;
    isDragging: boolean;
    isDragOver: boolean;
    onToggleVisibility: (layerId: string) => void;
    onOpenSettings: (layerId: string) => void;
    onRenameLayer?: (layerId: string) => void;
    onDuplicateLayer?: (layerId: string) => void;
    onDeleteLayer?: (layerId: string) => void;
    onDragStart: (index: number) => void;
    onDragOver: (index: number) => void;
    onDragEnd: () => void;
    onDragLeave: () => void;
  }

  const {
    layer,
    index,
    isDragging,
    isDragOver,
    onToggleVisibility,
    onOpenSettings,
    onRenameLayer,
    onDuplicateLayer,
    onDeleteLayer,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragLeave
  }: Props = $props();

  const isSubLayer = $derived(Boolean(layer.isSubLayer));
  const isDraggable = $derived(!isSubLayer);

  function handleDragStart(event: DragEvent): void {
    if (!isDraggable) return;
    if (!event.dataTransfer) return;

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
    onDragStart(index);
  }

  function handleDragOver(event: DragEvent): void {
    if (!isDraggable) return;
    event.preventDefault();
    if (!event.dataTransfer) return;

    event.dataTransfer.dropEffect = 'move';
    onDragOver(index);
  }

  function handleDragEnter(event: DragEvent): void {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent): void {
    if (!isDraggable) return;
    event.preventDefault();
    onDragEnd();
  }

  function handleToggleVisibility(): void {
    onToggleVisibility(layer.id);
  }

  function handleOpenSettings(): void {
    onOpenSettings(layer.id);
  }
</script>

<div id="khartis-layer-item-tool">
  <div
    class="layer-item"
    class:sub-layer={isSubLayer}
    class:dragging={isDragging}
    class:drag-over={isDragOver}
    role="listitem"
    draggable={isDraggable}
    ondragstart={isDraggable ? handleDragStart : undefined}
    ondragover={isDraggable ? handleDragOver : undefined}
    ondragenter={isDraggable ? handleDragEnter : undefined}
    ondrop={isDraggable ? handleDrop : undefined}
    ondragleave={isDraggable ? onDragLeave : undefined}
    ondragend={isDraggable ? onDragEnd : undefined}
  >
    <div class="layer-indicator" style="background-color: {layer.color}"></div>

    {#if isDraggable}
      <Draggable class="layer-drag-handle" />
    {/if}

    <layer.icon size={16} class="layer-icon" style="fill: {layer.color}" />

    <span class="layer-name">{layer.name}</span>

    <div class="layer-actions">
      <Button
        kind="ghost"
        size="small"
        icon={layer.visible ? ViewFilled : ViewOff}
        iconDescription={layer.visible ? m.layers_hide() : m.layers_show()}
        onclick={handleToggleVisibility}
      />

      <Button
        kind="ghost"
        size="small"
        icon={Settings}
        iconDescription={m.layers_settings()}
        onclick={handleOpenSettings}
      />

      {#if !isSubLayer}
        <OverflowMenu
          size="sm"
          flipped
          iconDescription={m.layers_more_options()}
        >
          <OverflowMenuItem
            text={m.layers_rename()}
            on:click={() => onRenameLayer?.(layer.id)}
          />
          <OverflowMenuItem
            text={m.layers_duplicate()}
            on:click={() => onDuplicateLayer?.(layer.id)}
          />
          <OverflowMenuItem
            danger
            text={m.layers_delete()}
            on:click={() => onDeleteLayer?.(layer.id)}
          />
        </OverflowMenu>
      {/if}
    </div>
  </div>
</div>

<style>
  .layer-item {
    display: flex;
    align-items: center;
    padding: var(--cds-spacing-03);
    border: 1px solid var(--cds-border-subtle);
    margin-bottom: 1px;
    background-color: var(--cds-ui-01);
    margin: var(--cds-spacing-02) 0;
    position: relative;
    border-left: 4px solid transparent;
    cursor: grab;
    transition: all 0.2s ease;
  }

  .layer-item.sub-layer {
    background-color: var(--cds-layer-01);
    border-color: var(--cds-border-subtle-01);
    cursor: default;
  }

  .layer-item:hover {
    background-color: var(--cds-hover-ui);
  }

  .layer-item.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }

  .layer-item.drag-over {
    border-top: 2px solid var(--cds-interactive-01);
    background-color: var(--cds-hover-selected-ui);
  }

  .layer-indicator {
    position: absolute;
    left: -4px;
    top: 0;
    bottom: 0;
    width: 4px;
  }

  #khartis-layer-item-tool :global(.layer-icon) {
    fill: var(--cds-icon-secondary);
  }

  #khartis-layer-item-tool :global(.drag-handle) {
    cursor: grab;
  }

  #khartis-layer-item-tool :global(.drag-handle:hover) {
    cursor: grab;
  }

  .layer-name {
    flex: 1;
    font-size: 12px;
    color: var(--cds-text-primary);
    margin-left: var(--cds-spacing-03);
  }

  .layer-actions {
    display: flex;
    gap: var(--cds-spacing-02);
  }

  #khartis-layer-item-tool :global(.layer-drag-handle) {
    margin-left: var(--cds-spacing-02);
    margin-right: var(--cds-spacing-04);
  }
</style>
