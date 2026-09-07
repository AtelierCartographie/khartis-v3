<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import * as m from '$lib/paraglide/messages';
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
    showDragHandle?: boolean;
  }

  const {
    layer,
    onToggleVisibility,
    onOpenSettings,
    showDragHandle = true
  }: Props = $props();

  const isVizPrimitive = $derived(layer.kind === 'viz-primitive');
  // Primitive rows use split title/subtitle fields; basemap rows fall back to `name`.
  const title = $derived(layer.primitiveLabel ?? layer.name);
  const accentColor = $derived(layer.accentColor ?? layer.color);
</script>

<div
  class="layer-row"
  class:layer-row--viz={isVizPrimitive}
  class:layer-row--basemap={!isVizPrimitive}
  role="listitem"
>
  <div class="accent-bar" style:background-color={accentColor}></div>
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
      <span class="layer-icon" style:color={accentColor}>
        <layer.icon size={16} />
      </span>
    {/if}
    <span class="layer-text">
      <span class="layer-name" class:layer-name--strong={isVizPrimitive}
        >{title}</span
      >
      {#if layer.subtitle}
        <span class="layer-subtitle">{layer.subtitle}</span>
      {/if}
    </span>
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
  </div>
</div>

<style>
  .layer-row {
    display: flex;
    align-items: center;
    min-height: 40px;
    padding: 0 8px 0 0;
    gap: 8px;
    background-color: var(--cds-layer-01, #f4f4f4);
    border: 1px solid var(--cds-border-tile-01, #c6c6c6);
    cursor: grab;
    transition: background-color 0.15s ease;
  }

  .layer-row:hover {
    background-color: var(--cds-layer-hover, #e8e8e8);
  }

  .layer-row--viz {
    min-height: 48px;
  }

  .accent-bar {
    align-self: stretch;
    width: 4px;
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
    padding: 4px 0;
  }

  .layer-text {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    min-width: 0;
  }

  .layer-name {
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-primary, #161616);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .layer-name--strong {
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 0.16px;
    font-weight: 600;
  }

  .layer-subtitle {
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-helper, #6f6f6f);
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
