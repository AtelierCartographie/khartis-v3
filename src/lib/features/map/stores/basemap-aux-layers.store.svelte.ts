import {
  persistenceRegistry,
  SavePriority
} from '$lib/features/project-management/core';

const STORE_KEY = 'basemapAuxLayers';

export type AuxLayerStyleOverride = Record<string, unknown>;

interface SerializedAuxLayers {
  visibility: Record<string, boolean>;
  styles?: Record<string, AuxLayerStyleOverride>;
  order?: Record<string, string[]>;
}

interface BasemapAuxLayersState {
  visibility: Map<string, boolean>;
  styles: Map<string, AuxLayerStyleOverride>;
  order: Map<string, string[]>;
  version: number;
}

function createBasemapAuxLayersStore() {
  const state = $state<BasemapAuxLayersState>({
    visibility: new Map(),
    styles: new Map(),
    order: new Map(),
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

  function getStyle(
    basemapFile: string,
    layerFile: string
  ): AuxLayerStyleOverride | undefined {
    const key = buildKey(basemapFile, layerFile);
    return state.styles.get(key);
  }

  function updateStyle(
    basemapFile: string,
    layerFile: string,
    updates: AuxLayerStyleOverride
  ): void {
    const key = buildKey(basemapFile, layerFile);
    const previous = state.styles.get(key) ?? {};
    state.styles.set(key, { ...previous, ...updates });
    state.styles = new Map(state.styles);
    state.version += 1;
    persistenceRegistry.notifyChange(STORE_KEY, SavePriority.DEBOUNCED);
  }

  function clearStyle(basemapFile: string, layerFile: string): void {
    const key = buildKey(basemapFile, layerFile);
    if (!state.styles.has(key)) return;
    state.styles.delete(key);
    state.styles = new Map(state.styles);
    state.version += 1;
    persistenceRegistry.notifyChange(STORE_KEY, SavePriority.DEBOUNCED);
  }

  function getOrderedLayerKeys(
    basemapFile: string,
    layerFiles: readonly string[]
  ): string[] {
    const savedOrder = state.order.get(basemapFile) ?? [];
    const available = new Set(layerFiles);
    const ordered = savedOrder.filter((layerFile) => available.has(layerFile));

    for (const layerFile of layerFiles) {
      if (!ordered.includes(layerFile)) {
        ordered.push(layerFile);
      }
    }

    return ordered;
  }

  function setOrder(basemapFile: string, layerFiles: readonly string[]): void {
    const nextOrder = layerFiles.filter(
      (layerFile, index, list) =>
        typeof layerFile === 'string' &&
        layerFile.length > 0 &&
        list.indexOf(layerFile) === index
    );
    state.order.set(basemapFile, nextOrder);
    state.order = new Map(state.order);
    state.version += 1;
    persistenceRegistry.notifyChange(STORE_KEY, SavePriority.DEBOUNCED);
  }

  function reset(): void {
    state.visibility = new Map();
    state.styles = new Map();
    state.order = new Map();
    state.version += 1;
  }

  function serialize(): SerializedAuxLayers {
    return {
      visibility: Object.fromEntries(state.visibility),
      styles: Object.fromEntries(state.styles),
      order: Object.fromEntries(state.order)
    };
  }

  function deserialize(data: SerializedAuxLayers | undefined): void {
    if (!data) {
      reset();
      return;
    }
    state.visibility = data.visibility
      ? new Map(Object.entries(data.visibility))
      : new Map();
    state.styles = data.styles
      ? new Map(Object.entries(data.styles))
      : new Map();
    state.order = data.order ? new Map(Object.entries(data.order)) : new Map();
    state.version += 1;
  }

  return {
    isVisible,
    setVisible,
    getStyle,
    updateStyle,
    clearStyle,
    getOrderedLayerKeys,
    setOrder,
    serialize,
    deserialize,
    get version() {
      return state.version;
    }
  };
}

export const basemapAuxLayersStore = createBasemapAuxLayersStore();

persistenceRegistry.register<SerializedAuxLayers>({
  key: STORE_KEY,
  priority: SavePriority.DEBOUNCED,
  serialize: () => basemapAuxLayersStore.serialize(),
  deserialize: (data) => basemapAuxLayersStore.deserialize(data),
  reset: () => {
    // Intentionally a no-op: state lifecycle is fully driven by deserialize.
    // The registry resetAll() runs after deserialize during project load,
    // so doing a hard reset here would wipe the value we just restored.
    // A fresh project triggers deserialize(undefined) which clears state.
  }
});
