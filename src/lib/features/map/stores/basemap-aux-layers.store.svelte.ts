import {
  persistenceRegistry,
  SavePriority
} from '$lib/features/project-management/core/persistence-registry';

const STORE_KEY = 'basemapAuxLayers';
const SINGLETON_KEY = '__khartisBasemapAuxLayersStore';

interface SerializedAuxLayers {
  visibility: Record<string, boolean>;
}

interface GlobalRegistry {
  [SINGLETON_KEY]?: BasemapAuxLayersStore;
}

interface BasemapAuxLayersState {
  visibility: Map<string, boolean>;
  version: number;
}

function createBasemapAuxLayersStore() {
  const state = $state<BasemapAuxLayersState>({
    visibility: new Map(),
    version: 0
  });

  function buildKey(basemapFile: string, layerFile: string): string {
    return `${basemapFile}::${layerFile}`;
  }

  function isVisible(
    basemapFile: string,
    layerFile: string,
    defaultVisible: boolean
  ): boolean {
    const key = buildKey(basemapFile, layerFile);
    return state.visibility.has(key)
      ? (state.visibility.get(key) ?? defaultVisible)
      : defaultVisible;
  }

  function setVisible(
    basemapFile: string,
    layerFile: string,
    visible: boolean
  ): void {
    const key = buildKey(basemapFile, layerFile);
    state.visibility.set(key, visible);
    state.visibility = new Map(state.visibility);
    state.version += 1;
    persistenceRegistry.notifyChange(STORE_KEY, SavePriority.IMMEDIATE);
  }

  function reset(): void {
    state.visibility = new Map();
    state.version += 1;
  }

  function serialize(): SerializedAuxLayers {
    return {
      visibility: Object.fromEntries(state.visibility)
    };
  }

  function deserialize(data: SerializedAuxLayers | undefined): void {
    if (!data?.visibility) {
      reset();
      return;
    }
    state.visibility = new Map(Object.entries(data.visibility));
    state.version += 1;
  }

  return {
    isVisible,
    setVisible,
    reset,
    serialize,
    deserialize,
    get version() {
      return state.version;
    }
  };
}

export type BasemapAuxLayersStore = ReturnType<
  typeof createBasemapAuxLayersStore
>;

function getOrCreateStore(): BasemapAuxLayersStore {
  const globalRef = globalThis as unknown as GlobalRegistry;
  if (!globalRef[SINGLETON_KEY]) {
    const instance = createBasemapAuxLayersStore();
    globalRef[SINGLETON_KEY] = instance;
    persistenceRegistry.register<SerializedAuxLayers>({
      key: STORE_KEY,
      priority: SavePriority.DEBOUNCED,
      serialize: () => instance.serialize(),
      deserialize: (data) => instance.deserialize(data),
      reset: () => {
        // Intentionally a no-op: state lifecycle is fully driven by deserialize.
        // The registry resetAll() runs after deserialize during project load,
        // so doing a hard reset here would wipe the value we just restored.
        // A fresh project triggers deserialize(undefined) which clears state.
      }
    });
  }
  return globalRef[SINGLETON_KEY];
}

export const basemapAuxLayersStore = getOrCreateStore();
