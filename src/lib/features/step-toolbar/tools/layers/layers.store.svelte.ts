import type { Layer, LayersState } from './layers.types';

const FIXTURE_LAYERS = [
  {
    id: 'texts',
    name: 'Textes',
    visible: true,
    type: 'visualization' as const,
    color: '#22c55e',
    opacity: 100,
    order: 0
  },
  {
    id: 'symbols',
    name: 'Symboles',
    visible: true,
    type: 'visualization' as const,
    color: '#22c55e',
    opacity: 100,
    order: 1
  },
  {
    id: 'borders',
    name: 'Frontières',
    visible: true,
    type: 'geographic' as const,
    color: '#dc2626',
    opacity: 100,
    order: 0
  },
  {
    id: 'equator',
    name: 'Équateur',
    visible: false,
    type: 'geographic' as const,
    color: '#dc2626',
    opacity: 50,
    order: 1
  }
];

const DEFAULT_STATE: LayersState = {
  layers: [...FIXTURE_LAYERS],
  expandedSections: {
    visualization: true,
    geographic: false
  },
  dragState: {
    dragIndex: null,
    dragOverIndex: null,
    isDragging: false
  }
};

export const layersState = $state<LayersState>({ ...DEFAULT_STATE });

export const layersActions = {
  setState(newState: Partial<LayersState>): void {
    Object.assign(layersState, newState);
    console.log('[Layers] 🔄 State updated:', newState);
  },

  addLayer(layer: Omit<Layer, 'id' | 'order'>): Layer {
    const layersOfType = layersState.layers.filter(
      (l) => l.type === layer.type
    );
    const maxOrder = Math.max(-1, ...layersOfType.map((l) => l.order));

    const newLayer: Layer = {
      ...layer,
      id: `layer-${Date.now()}`,
      order: maxOrder + 1
    };

    layersState.layers.push(newLayer);
    console.log(
      '[Layers] ➕ Added new layer:',
      newLayer.name,
      '(',
      newLayer.type,
      ')'
    );
    console.log(
      '[Layers] 🎨 Color:',
      newLayer.color,
      '| Opacity:',
      newLayer.opacity + '%'
    );
    return newLayer;
  },

  updateLayer(id: string, updates: Partial<Layer>): void {
    const index = layersState.layers.findIndex((layer) => layer.id === id);
    if (index !== -1) {
      layersState.layers[index] = { ...layersState.layers[index], ...updates };
      console.log('[Layers] ✏️ Updated layer:', id, updates);
    } else {
      console.log('[Layers] ❌ Layer not found:', id);
    }
  },

  removeLayer(id: string): void {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      layersState.layers = layersState.layers.filter((l) => l.id !== id);
      this.reorderLayersOfType(layer.type);
      console.log('[Layers] 🗑️ Removed layer:', layer.name);
    } else {
      console.log('[Layers] ❌ Layer not found:', id);
    }
  },

  toggleLayerVisibility(id: string): void {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      layer.visible = !layer.visible;
      console.log(
        '[Layers] 👁️ Toggled visibility for:',
        layer.name,
        '→',
        layer.visible
      );
    }
  },

  setLayerOpacity(id: string, opacity: number): void {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      layer.opacity = Math.max(0, Math.min(100, opacity));
      console.log(
        '[Layers] 🎨 Set opacity for:',
        layer.name,
        '→',
        layer.opacity + '%'
      );
    }
  },

  setLayerColor(id: string, color: string): void {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      layer.color = color;
      console.log('[Layers] 🌈 Set color for:', layer.name, '→', color);
    }
  },

  reorderLayers(fromIndex: number, toIndex: number): void {
    const layers = [...layersState.layers];
    const [removed] = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, removed);

    layersState.layers = layers;
    this.updateLayerOrders();
    console.log(
      '[Layers] 🔄 Reordered layers from index',
      fromIndex,
      'to',
      toIndex
    );
  },

  toggleSectionExpanded(section: string): void {
    layersState.expandedSections[section] =
      !layersState.expandedSections[section];
    console.log(
      '[Layers] 📁 Toggled section:',
      section,
      '→',
      layersState.expandedSections[section]
    );
  },

  duplicateLayer(id: string): Layer | null {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      const duplicate = this.addLayer({
        ...layer,
        name: `${layer.name} (copie)`
      });
      console.log('[Layers] 📋 Duplicated layer:', layer.name);
      return duplicate;
    }
    return null;
  },

  updateLayerOrders(): void {
    const visualizationLayers = getLayersByType('visualization');
    const geographicLayers = getLayersByType('geographic');

    visualizationLayers.forEach((layer, index) => {
      layer.order = index;
    });

    geographicLayers.forEach((layer, index) => {
      layer.order = index;
    });

    console.log('[Layers] 🔢 Updated layer orders');
  },

  reorderLayersOfType(type: 'visualization' | 'geographic'): void {
    const layers = getLayersByType(type);
    layers.forEach((layer, index) => {
      layer.order = index;
    });
    console.log('[Layers] 🔢 Reordered', type, 'layers');
  },

  setDragState(dragState: Partial<LayersState['dragState']>): void {
    layersState.dragState = { ...layersState.dragState, ...dragState };
    if (dragState.isDragging !== undefined) {
      console.log(
        '[Layers] 🖱️ Drag state:',
        dragState.isDragging ? 'started' : 'ended'
      );
    }
  },

  startDragging(index: number): void {
    layersState.dragState = {
      dragIndex: index,
      dragOverIndex: null,
      isDragging: true
    };
    console.log('[Layers] 🖱️ Started dragging layer at index:', index);
  },

  endDragging(): void {
    const { dragIndex, dragOverIndex } = layersState.dragState;

    if (
      dragIndex !== null &&
      dragOverIndex !== null &&
      dragIndex !== dragOverIndex
    ) {
      this.reorderLayers(dragIndex, dragOverIndex);
    }

    layersState.dragState = {
      dragIndex: null,
      dragOverIndex: null,
      isDragging: false
    };

    console.log('[Layers] 🖱️ Ended dragging');
  },

  reset(): void {
    console.log('[Layers] 🔄 Reset to default state with fixture data');
    Object.assign(layersState, DEFAULT_STATE);
  }
};

export function getLayersByType(type: 'visualization' | 'geographic'): Layer[] {
  return layersState.layers
    .filter((l) => l.type === type)
    .sort((a, b) => a.order - b.order);
}

export function getVisibleLayersByType(
  type: 'visualization' | 'geographic'
): Layer[] {
  return getLayersByType(type).filter((l) => l.visible);
}

export function getLayerById(id: string): Layer | undefined {
  return layersState.layers.find((l) => l.id === id);
}
