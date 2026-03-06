<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { m } from '$lib/paraglide/messages';
  import { OverflowMenu, OverflowMenuItem } from 'carbon-components-svelte';
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

  function handleDragStart(event: DragEvent): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
    onDragStart(index);
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!event.dataTransfer) return;
    event.dataTransfer.dropEffect = 'move';
    onDragOver(index);
  }

  function handleDragEnter(event: DragEvent): void {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    onDragEnd();
  }
</script>

<div id="khartis-layer-item-tool">
  {#if isSubLayer}
    <div
      class="sublayer-card"
      class:dragging={isDragging}
      class:drag-over={isDragOver}
      role="listitem"
      draggable={true}
      ondragstart={handleDragStart}
      ondragover={handleDragOver}
      ondragenter={handleDragEnter}
      ondrop={handleDrop}
      ondragleave={onDragLeave}
      ondragend={onDragEnd}
    >
      <div class="color-bar" style:background-color={layer.color}></div>

      <Draggable size={16} class="sublayer-drag-icon" />

      <div class="sublayer-content">
        {#if layer.icon}
          <layer.icon size={16} style="fill: {layer.color}" />
        {/if}
        <span class="sublayer-name">{layer.name}</span>
      </div>

      <div class="sublayer-actions">
        <IconButton
          kind="ghost"
          size="small"
          icon={layer.visible ? ViewFilled : ViewOff}
          iconDescription={layer.visible ? m.layers_hide() : m.layers_show()}
          onclick={() => onToggleVisibility(layer.id)}
        />
        <IconButton
          kind="ghost"
          size="small"
          icon={Settings}
          iconDescription={m.layers_settings()}
          onclick={() => onOpenSettings(layer.id)}
        />
      </div>
    </div>
  {:else}
    <div
      class="layer-card"
      class:dragging={isDragging}
      class:drag-over={isDragOver}
      role="listitem"
      draggable={true}
      ondragstart={handleDragStart}
      ondragover={handleDragOver}
      ondragenter={handleDragEnter}
      ondrop={handleDrop}
      ondragleave={onDragLeave}
      ondragend={onDragEnd}
    >
      <Draggable size={16} class="layer-drag-icon" />

      <span class="layer-title">{layer.name}</span>

      <div class="layer-actions">
        <IconButton
          kind="ghost"
          size="small"
          icon={layer.visible ? ViewFilled : ViewOff}
          iconDescription={layer.visible ? m.layers_hide() : m.layers_show()}
          onclick={() => onToggleVisibility(layer.id)}
        />
        <OverflowMenu
          size="sm"
          flipped
          iconDescription={m.layers_more_options()}
        >
          {#if layer.type !== 'visualization'}
            <OverflowMenuItem
              text={m.layers_rename()}
              on:click={() => onRenameLayer?.(layer.id)}
            />
          {/if}
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
      </div>
    </div>
  {/if}
</div>

<style>
  /* Parent layer card — 64px, strong border */
  .layer-card {
    display: flex;
    align-items: center;
    height: 64px;
    padding: 16px 8px 16px 12px;
    gap: 8px;
    background-color: var(--cds-layer-01);
    border: 1px solid var(--cds-border-strong-01);
    cursor: grab;
    transition: background-color 0.15s ease;
  }

  .layer-card:hover {
    background-color: var(--cds-layer-hover-01);
  }

  .layer-card.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }

  .layer-card.drag-over {
    border-top: 2px solid var(--cds-interactive);
    background-color: var(--cds-layer-selected-hover-01);
  }

  #khartis-layer-item-tool :global(.layer-drag-icon) {
    flex-shrink: 0;
    color: var(--cds-icon-secondary);
  }

  .layer-title {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .layer-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* Sublayer card — 32px, tile border */
  .sublayer-card {
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 8px 0 1px;
    gap: 7px;
    background-color: var(--cds-layer-01);
    border: 1px solid var(--cds-border-tile-01);
    cursor: grab;
    transition: background-color 0.15s ease;
  }

  .sublayer-card:hover {
    background-color: var(--cds-layer-hover-01);
  }

  .sublayer-card.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }

  .sublayer-card.drag-over {
    border-top: 2px solid var(--cds-interactive);
  }

  .color-bar {
    width: 4px;
    height: 30px;
    flex-shrink: 0;
  }

  #khartis-layer-item-tool :global(.sublayer-drag-icon) {
    flex-shrink: 0;
    color: var(--cds-icon-secondary);
  }

  .sublayer-content {
    display: flex;
    align-items: center;
    flex: 1;
    gap: var(--cds-spacing-03);
    min-width: 0;
    padding-left: 1px;
  }

  .sublayer-name {
    flex: 1;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sublayer-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
</style>
