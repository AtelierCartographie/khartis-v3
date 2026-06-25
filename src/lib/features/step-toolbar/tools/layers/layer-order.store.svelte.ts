import {
  persistenceRegistry,
  SavePriority
} from '$lib/features/project-management/core/persistence-registry';

/**
 * Single source of truth for the layer stacking order.
 *
 * The order is a flat list of panel row ids (see `buildVisualizationSubLayerId`
 * / `buildBasemapSubLayerId`), top→bottom = front→back. `buildLayers` projects
 * the live row set onto this order (honouring it, dropping stale ids, inserting
 * unseen rows at their default slot) and the GPU render path draws the reverse.
 * There is no other ordering dimension: a drag rewrites this list and nothing
 * re-clamps it, so any layer can sit above or below any other.
 */
interface LayerOrderState {
  order: string[];
  version: number;
}

function createLayerOrderStore() {
  const state = $state<LayerOrderState>({ order: [], version: 0 });

  function setOrder(ids: string[]): void {
    state.order = [...ids];
    state.version += 1;
    persistenceRegistry.notifyChange('layerOrder', SavePriority.IMMEDIATE);
  }

  function reset(): void {
    state.order = [];
    state.version += 1;
    persistenceRegistry.notifyChange('layerOrder', SavePriority.IMMEDIATE);
  }

  // Called inside `withPersistenceSuspended` during project load, so the
  // version bump never marks the project dirty.
  function restoreFromSerialized(data: unknown): void {
    state.order = Array.isArray(data)
      ? data.filter((id): id is string => typeof id === 'string')
      : [];
    state.version += 1;
  }

  return {
    get order(): string[] {
      return [...state.order];
    },
    get version(): number {
      return state.version;
    },
    setOrder,
    reset,
    restoreFromSerialized
  };
}

export const layerOrderStore = createLayerOrderStore();

persistenceRegistry.register<string[]>({
  key: 'layerOrder',
  serialize: () => layerOrderStore.order,
  deserialize: (data) => layerOrderStore.restoreFromSerialized(data),
  reset: () => layerOrderStore.reset(),
  priority: SavePriority.IMMEDIATE
});
