<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import * as m from '$lib/paraglide/messages';
  import { OverflowMenu, OverflowMenuItem } from 'carbon-components-svelte';
  import {
    ChevronDown,
    ChevronUp,
    Draggable,
    Settings,
    ViewFilled,
    ViewOff
  } from 'carbon-icons-svelte';
  import type { Layer } from './layers.types.js';

  interface Props {
    layer: Layer;
    hasChildren?: boolean;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    onToggleVisibility: (layerId: string) => void;
    onOpenSettings: (layerId: string) => void;
    onRenameLayer?: (layerId: string) => void;
    onDuplicateLayer?: (layerId: string) => void;
    onDeleteLayer?: (layerId: string) => void;
  }

  const {
    layer,
    hasChildren = false,
    isCollapsed = false,
    onToggleCollapse,
    onToggleVisibility,
    onOpenSettings,
    onRenameLayer,
    onDuplicateLayer,
    onDeleteLayer
  }: Props = $props();
</script>

{#if layer.isSubLayer}
  <div class="sublayer-card">
    <div class="color-bar" style:background-color={layer.color}></div>
    <div class="drag-handle">
      <Draggable size={16} />
    </div>
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
  <div class="layer-card">
    <div class="drag-handle">
      <Draggable size={16} />
    </div>
    {#if hasChildren}
      <IconButton
        kind="ghost"
        size="small"
        icon={isCollapsed ? ChevronDown : ChevronUp}
        iconDescription={isCollapsed ? m.layers_expand() : m.layers_collapse()}
        onclick={() => onToggleCollapse?.()}
      />
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
      {#if layer.type === 'visualization'}
        <OverflowMenu size="sm" flipped iconDescription={m.layers_more_options()}>
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
