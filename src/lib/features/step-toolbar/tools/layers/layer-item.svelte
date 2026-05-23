<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import * as m from '$lib/paraglide/messages';
  import { OverflowMenu, OverflowMenuItem } from 'carbon-components-svelte';
  import { dragHandle } from 'svelte-dnd-action';
  import {
    ChevronDown,
    ChevronUp,
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
    onRenameLayer?: (layerId: string) => void;
    onDuplicateLayer?: (layerId: string) => void;
    onDeleteLayer?: (layerId: string) => void;
    showDragHandle?: boolean;
    isExpanded?: boolean;
    showExpandToggle?: boolean;
    onToggleExpanded?: () => void;
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
    showDragHandle = true,
    isExpanded = true,
    showExpandToggle = false,
    onToggleExpanded
  }: Props = $props();
</script>

{#if layer.isSubLayer}
  <div class="sublayer-card" role="listitem">
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
    <div class="sublayer-content">
      {#if layer.icon}
        <span class="sublayer-icon" style:color={layer.color}>
          <layer.icon size={16} />
        </span>
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
  <div class="layer-card" role="listitem">
    {#if showDragHandle}
      <div
        class="drag-handle"
        use:dragHandle
        aria-label={`${m.layers_reorder()} ${layer.name}`}
      >
        <Draggable size={16} />
      </div>
    {/if}
    <span class="layer-title">{layer.name}</span>
    <div class="layer-actions">
      <IconButton
        kind="ghost"
        size="small"
        icon={layer.visible ? ViewFilled : ViewOff}
        iconDescription={layer.visible ? m.layers_hide() : m.layers_show()}
        onclick={() => onToggleVisibility(layer.id)}
      />
      {#if showExpandToggle}
        <IconButton
          kind="ghost"
          size="small"
          icon={isExpanded ? ChevronUp : ChevronDown}
          iconDescription={m.section_toggle()}
          aria-expanded={isExpanded}
          onclick={() => onToggleExpanded?.()}
        />
      {/if}
      {#if layer.type === 'visualization'}
        <OverflowMenu
          size="sm"
          flipped
          iconDescription={m.layers_more_options()}
        >
          <OverflowMenuItem
            text={m.layers_settings()}
            on:click={() => onOpenSettings(layer.id)}
          />
          <OverflowMenuItem
            text={m.layers_rename()}
            on:click={() => onRenameLayer?.(layer.id)}
          />
          <OverflowMenuItem
            text={m.layers_duplicate()}
            on:click={() => onDuplicateLayer?.(layer.id)}
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
            on:click={() => onDeleteLayer?.(layer.id)}
          />
        </OverflowMenu>
      {/if}
    </div>
  </div>
{/if}

<style>
  .layer-card {
    display: flex;
    align-items: center;
    height: 64px;
    padding: 16px 8px 16px 12px;
    gap: 8px;
    background-color: var(--cds-layer);
    border: 1px solid var(--cds-border-strong-01);
    cursor: grab;
    transition: background-color 0.15s ease;
  }

  .layer-card:hover {
    background-color: var(--cds-layer-hover);
  }

  .drag-handle {
    flex-shrink: 0;
    color: var(--cds-icon-secondary);
    display: flex;
    align-items: center;
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

  .sublayer-card {
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 8px 0 1px;
    gap: 7px;
    background-color: var(--cds-layer);
    border: 1px solid var(--cds-border-tile-01);
    cursor: grab;
    transition: background-color 0.15s ease;
  }

  .sublayer-card:hover {
    background-color: var(--cds-layer-hover);
  }

  .color-bar {
    width: 4px;
    height: 30px;
    flex-shrink: 0;
  }

  .sublayer-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
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
