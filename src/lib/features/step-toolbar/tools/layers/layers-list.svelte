<script lang="ts">
  import { dragHandleZone } from 'svelte-dnd-action';
  import { untrack } from 'svelte';
  import { markRecentDndInteraction } from '$lib/features/map/utils/tool-popover-drag-visibility.utils';
  import LayerItem from './layer-item.svelte';
  import type { Layer } from '../../types/layers.types';

  interface Props {
    layers: Layer[];
    onToggleVisibility: (layerId: string) => void;
    onOpenSettings: (layerId: string) => void;
    onReorder: (fromIndex: number, toIndex: number) => void;
    reorderable?: boolean;
  }

  const {
    layers,
    onToggleVisibility,
    onOpenSettings,
    onReorder,
    reorderable = true
  }: Props = $props();

  const FLIP_DURATION_MS = 200;

  let items = $state<Layer[]>([]);
  let dragging = $state(false);

  $effect(() => {
    if (!untrack(() => dragging)) {
      items = layers.map((layer) => ({ ...layer }));
    }
  });

  function handleConsider(e: Event): void {
    dragging = true;
    markRecentDndInteraction();
    items = (e as CustomEvent).detail.items;
  }

  function handleFinalize(e: Event): void {
    const { items: newItems, info } = (e as CustomEvent).detail;
    items = newItems;
    dragging = false;
    markRecentDndInteraction();

    const fromIndex = layers.findIndex((layer) => layer.id === info.id);
    const toIndex = (newItems as Layer[]).findIndex(
      (layer) => layer.id === info.id
    );

    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
  }
</script>

<div
  class="layers-container"
  role="list"
  use:dragHandleZone={{
    items,
    flipDurationMs: FLIP_DURATION_MS,
    type: 'flat-layers',
    dragDisabled: !reorderable,
    dropTargetStyle: {},
    useCursorForDetection: true
  }}
  onconsider={handleConsider}
  onfinalize={handleFinalize}
>
  {#each items as layer (layer.id)}
    <LayerItem
      layer={layer}
      onToggleVisibility={onToggleVisibility}
      onOpenSettings={onOpenSettings}
      showDragHandle={reorderable && !layer.tiledLayerGroupIds}
    />
  {/each}
</div>

<style>
  .layers-container {
    display: flex;
    flex-direction: column;
    gap: 2px;
    outline: none;
    padding-bottom: var(--cds-spacing-03);
  }

  .layers-container :global([aria-grabbed='true']) {
    opacity: 0.4;
  }
</style>
