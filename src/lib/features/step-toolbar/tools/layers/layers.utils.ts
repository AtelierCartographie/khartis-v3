import type { Layer, LayerType } from './layers.types.js';

export function reorderLayersArray<T extends Layer>(
  layers: T[],
  type: LayerType,
  dragIndex: number,
  hoverIndex: number
): T[] {
  const filteredLayers = layers.filter((layer) => layer.type === type);
  const otherLayers = layers.filter((layer) => layer.type !== type);

  const draggedLayer = filteredLayers[dragIndex];
  filteredLayers.splice(dragIndex, 1);
  filteredLayers.splice(hoverIndex, 0, draggedLayer);

  return type === 'visualization'
    ? [...filteredLayers, ...otherLayers]
    : [...otherLayers, ...filteredLayers];
}

export function toggleLayerVisibility(layers: Layer[], layerId: string): void {
  const layer = layers.find((l) => l.id === layerId);
  if (layer) {
    layer.visible = !layer.visible;
  }
}

export function getVisibleLayersCount(layers: Layer[]): number {
  return layers.filter((layer) => layer.visible).length;
}

export function filterLayersByType(layers: Layer[], type: LayerType): Layer[] {
  return layers.filter((layer) => layer.type === type);
}

export function createDragHandler<T>(
  setState: (state: T) => void,
  getState: () => T,
  property: keyof T
) {
  return (value: T[keyof T]) => {
    const currentState = getState();
    setState({ ...currentState, [property]: value });
  };
}

export function resetDragState<
  T extends { dragIndex: null; dragOverIndex: null }
>(setState: (state: T) => void): void {
  setState({ dragIndex: null, dragOverIndex: null } as T);
}
