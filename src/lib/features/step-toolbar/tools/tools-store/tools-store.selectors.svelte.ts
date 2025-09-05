import type { ToolState } from './tools-store.types';

export function getVisibleLayers(state: ToolState) {
  return state.layers.layers.filter((l) => l.visible);
}

export function getSearchResults(state: ToolState) {
  return state.search.results;
}

export function getActiveAnnotation(state: ToolState) {
  return state.annotations.items.find(
    (item) => item.id === state.annotations.selectedId
  );
}

export function getLayerById(state: ToolState, layerId: string) {
  return state.layers.layers.find((l) => l.id === layerId);
}
