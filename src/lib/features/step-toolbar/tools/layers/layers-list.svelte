<script lang="ts">
  import { dragHandleZone } from 'svelte-dnd-action';
  import { untrack } from 'svelte';
  import LayerItem from './layer-item.svelte';
  import type { Layer, LayerReorderScope } from '../../types/layers.types';

  interface Props {
    parentLayers: Layer[];
    childLayersByParent: Record<string, Layer[]>;
    onToggleVisibility: (layerId: string) => void;
    onOpenSettings: (layerId: string) => void;
    onReorderLayers: (
      scope: LayerReorderScope,
      fromIndex: number,
      toIndex: number
    ) => void;
    onReorderSubLayers: (
      parentId: string,
      fromIndex: number,
      toIndex: number
    ) => void;
    onMoveLayer?: (
      scope: LayerReorderScope,
      layerId: string,
      direction: -1 | 1
    ) => void;
    onRenameLayer?: (layerId: string) => void;
    onDuplicateLayer?: (layerId: string) => void;
    onDeleteLayer?: (layerId: string) => void;
    reorderScope: LayerReorderScope;
  }

  const {
    parentLayers,
    childLayersByParent,
    onToggleVisibility,
    onOpenSettings,
    onReorderLayers,
    onReorderSubLayers,
    onMoveLayer,
    onRenameLayer,
    onDuplicateLayer,
    onDeleteLayer,
    reorderScope
  }: Props = $props();

  const FLIP_DURATION_MS = 200;
  const RECENT_DND_INTERACTION_ATTRIBUTE = 'data-khartis-recent-dnd-at';

  function transformParentGhost(draggedEl: HTMLElement | undefined): void {
    if (!draggedEl) return;
    const sublayers = draggedEl.querySelector('.sublayers-container');
    if (sublayers instanceof HTMLElement) {
      sublayers.style.display = 'none';
    }
    const card = draggedEl.querySelector('.layer-card');
    if (card instanceof HTMLElement) {
      draggedEl.style.height = `${card.offsetHeight}px`;
    }
  }

  let parentItems = $state<Layer[]>([]);
  let childItems = $state<Record<string, Layer[]>>({});
  let collapsedParents = $state<Record<string, boolean>>({});
  let draggingParent = $state(false);
  let draggingChildOf: string | null = null;

  $effect(() => {
    if (!untrack(() => draggingParent)) {
      parentItems = parentLayers.map((l) => ({ ...l }));
    }
  });

  $effect(() => {
    if (!draggingChildOf) {
      const next: Record<string, Layer[]> = {};
      for (const [pid, children] of Object.entries(childLayersByParent)) {
        next[pid] = children.map((l) => ({ ...l }));
      }
      childItems = next;
    }
  });

  $effect(() => {
    const previousState = untrack(() => collapsedParents);
    const nextState = Object.fromEntries(
      parentLayers.map((layer, index) => [
        layer.id,
        previousState[layer.id] ?? index > 0
      ])
    );

    const previousEntries = Object.entries(previousState);
    const nextEntries = Object.entries(nextState);
    const hasChanged =
      previousEntries.length !== nextEntries.length ||
      nextEntries.some(([id, collapsed]) => previousState[id] !== collapsed);

    if (hasChanged) {
      collapsedParents = nextState;
    }
  });

  function getChildren(parentId: string): Layer[] {
    return childItems[parentId] ?? [];
  }

  function toggleParent(parentId: string): void {
    collapsedParents = {
      ...collapsedParents,
      [parentId]: !isParentCollapsed(parentId)
    };
  }

  function isParentCollapsed(parentId: string): boolean {
    return collapsedParents[parentId] ?? false;
  }

  function markRecentDndInteraction(): void {
    document.body.setAttribute(
      RECENT_DND_INTERACTION_ATTRIBUTE,
      String(Date.now())
    );
  }

  function handleParentConsider(e: Event): void {
    draggingParent = true;
    markRecentDndInteraction();
    parentItems = (e as CustomEvent).detail.items;
  }

  function handleParentFinalize(e: Event): void {
    const { items: newItems, info } = (e as CustomEvent).detail;
    parentItems = newItems;
    draggingParent = false;
    markRecentDndInteraction();

    const fromIndex = parentLayers.findIndex((layer) => layer.id === info.id);
    const toIndex = (newItems as Layer[]).findIndex(
      (layer) => layer.id === info.id
    );

    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      onReorderLayers(reorderScope, fromIndex, toIndex);
    }
  }

  function handleChildConsider(parentId: string, e: Event): void {
    draggingChildOf = parentId;
    markRecentDndInteraction();
    childItems = {
      ...childItems,
      [parentId]: (e as CustomEvent).detail.items
    };
  }

  function handleChildFinalize(parentId: string, e: Event): void {
    const { items: newItems, info } = (e as CustomEvent).detail;
    childItems = { ...childItems, [parentId]: newItems };
    draggingChildOf = null;
    markRecentDndInteraction();

    const oldChildren = childLayersByParent[parentId] ?? [];
    const fromIndex = oldChildren.findIndex((l) => l.id === info.id);
    const toIndex = (newItems as Layer[]).findIndex((l) => l.id === info.id);

    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      onReorderSubLayers(parentId, fromIndex, toIndex);
    }
  }
</script>

<div
  class="layers-container"
  role="list"
  use:dragHandleZone={{
    items: parentItems,
    flipDurationMs: FLIP_DURATION_MS,
    type: `parent-layers-${reorderScope}`,
    dropTargetStyle: {},
    transformDraggedElement: transformParentGhost,
    useCursorForDetection: true
  }}
  onconsider={handleParentConsider}
  onfinalize={handleParentFinalize}
>
  {#each parentItems as parentLayer, parentIndex (parentLayer.id)}
    <div class="layer-group">
      <LayerItem
        layer={parentLayer}
        onToggleVisibility={onToggleVisibility}
        onOpenSettings={onOpenSettings}
        canMoveUp={parentIndex > 0}
        canMoveDown={parentIndex < parentItems.length - 1}
        onMoveUp={() => onMoveLayer?.(reorderScope, parentLayer.id, -1)}
        onMoveDown={() => onMoveLayer?.(reorderScope, parentLayer.id, 1)}
        onRenameLayer={onRenameLayer}
        onDuplicateLayer={onDuplicateLayer}
        onDeleteLayer={onDeleteLayer}
        isExpanded={!isParentCollapsed(parentLayer.id)}
        showExpandToggle={getChildren(parentLayer.id).length > 0}
        onToggleExpanded={() => toggleParent(parentLayer.id)}
      />

      {#if getChildren(parentLayer.id).length > 0 && !draggingParent && !isParentCollapsed(parentLayer.id)}
        <div class="sublayers-container">
          <div class="sublayers-line"></div>
          <div
            class="sublayers-list"
            role="list"
            use:dragHandleZone={{
              items: getChildren(parentLayer.id),
              flipDurationMs: FLIP_DURATION_MS,
              type: `sublayers-${parentLayer.id}`,
              dropTargetStyle: {},
              useCursorForDetection: true
            }}
            onconsider={(e: Event) => handleChildConsider(parentLayer.id, e)}
            onfinalize={(e: Event) => handleChildFinalize(parentLayer.id, e)}
          >
            {#each getChildren(parentLayer.id) as childLayer (childLayer.id)}
              <LayerItem
                layer={childLayer}
                onToggleVisibility={onToggleVisibility}
                onOpenSettings={onOpenSettings}
              />
            {/each}
          </div>
        </div>
      {/if}
    </div>
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

  .sublayers-container {
    display: flex;
    gap: var(--cds-spacing-03);
    padding-left: var(--cds-spacing-05);
    margin-bottom: var(--cds-spacing-05);
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
    outline: none;
  }

  .layers-container :global([aria-grabbed='true']) {
    opacity: 0.4;
  }
</style>
