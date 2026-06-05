<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import * as m from '$lib/paraglide/messages';
  import { OverflowMenu, OverflowMenuItem } from 'carbon-components-svelte';
  import { dragHandle } from 'svelte-dnd-action';
  import {
    Draggable,
    Settings,
    ViewFilled,
    ViewOff
  } from 'carbon-icons-svelte';
  import type { Layer } from '../../types/layers.types';

  interface Props {
    layer: Layer;
    onToggleVisibility: (layerId: string) => void;
    onOpenSettings: (layerId: string) => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onRenameLayer?: (visualizationId: string) => void;
    onDuplicateLayer?: (visualizationId: string) => void;
    onDeleteLayer?: (visualizationId: string) => void;
    showDragHandle?: boolean;
  }

  const {
    layer,
    onToggleVisibility,
    onOpenSettings,
    canMoveUp = false,
    canMoveDown = false,
    onMoveUp,
    onMoveDown,
    onRenameLayer,
    onDuplicateLayer,
    onDeleteLayer,
    showDragHandle = true
  }: Props = $props();

  // Vivid accent for thematic primitive rows, sepia for shared basemap layers.
  const isVizPrimitive = $derived(layer.kind === 'viz-primitive');
  const visualizationId = $derived(layer.parentId);
</script>

<div
  class="layer-row"
  class:layer-row--viz={isVizPrimitive}
  class:layer-row--basemap={!isVizPrimitive}
  role="listitem"
>
  <div class="color-bar" style:background-color={layer.color}></div>
  {#if showDragHandle}
    <div
      class="drag-handle"
      use:dragHandle
      aria-label={`${m.layers_reorder()} ${layer.name}`}
    >
      <Draggable size={16} />
    </div>
  {/if}
  <div class="layer-content">
    {#if layer.icon}
      <span class="layer-icon" style:color={layer.color}>
        <layer.icon size={16} />
      </span>
    {/if}
    <span class="layer-name">{layer.name}</span>
  </div>
  <div class="layer-actions">
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
    {#if isVizPrimitive && visualizationId}
      <OverflowMenu size="sm" flipped iconDescription={m.layers_more_options()}>
        <OverflowMenuItem
          text={m.layers_rename()}
          on:click={() => onRenameLayer?.(visualizationId)}
        />
        <OverflowMenuItem
          text={m.layers_duplicate()}
          on:click={() => onDuplicateLayer?.(visualizationId)}
        />
        <OverflowMenuItem
          text={m.layers_move_up()}
          disabled={!canMoveUp}
          on:click={() => onMoveUp?.()}
        />
        <OverflowMenuItem
          text={m.layers_move_down()}
          disabled={!canMoveDown}
          on:click={() => onMoveDown?.()}
        />
        <OverflowMenuItem
          danger
          text={m.layers_delete()}
          on:click={() => onDeleteLayer?.(visualizationId)}
        />
      </OverflowMenu>
    {/if}
  </div>
</div>

<style>
  .layer-row {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 8px 0 0;
    gap: 8px;
    background-color: var(--cds-layer);
    border: 1px solid var(--cds-border-subtle-01);
    border-left-width: 3px;
    cursor: grab;
    transition: background-color 0.15s ease;
  }

  .layer-row:hover {
    background-color: var(--cds-layer-hover);
  }

  /* Vivid accent (thematic primitives) vs sepia (shared basemap layers). */
  .layer-row--viz {
    border-left-color: var(--cds-border-interactive, #4589ff);
  }

  .layer-row--basemap {
    border-left-color: var(--cds-border-strong-01, #8d8d8d);
  }

  .color-bar {
    width: 4px;
    height: 100%;
    flex-shrink: 0;
  }

  .drag-handle {
    flex-shrink: 0;
    color: var(--cds-icon-secondary);
    display: flex;
    align-items: center;
  }

  .layer-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .layer-content {
    display: flex;
    align-items: center;
    flex: 1;
    gap: var(--cds-spacing-03);
    min-width: 0;
  }

  .layer-name {
    flex: 1;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
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
</style>
