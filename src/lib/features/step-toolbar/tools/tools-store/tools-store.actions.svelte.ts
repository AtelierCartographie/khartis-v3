import { getLayerById } from './tools-store.selectors.svelte';
import type { ToolState } from './tools-store.types';

export function createSearchActions(state: ToolState) {
  function mockSearchResults(): void {
    if (state.search.searchValue.length > 0) {
      state.search.results = [
        {
          id: '1',
          text: `Result for "${state.search.searchValue}"`,
          location: 'Layer 1, Item 3'
        },
        {
          id: '2',
          text: `Match: ${state.search.searchValue}`,
          location: 'Layer 2, Item 7'
        },
        {
          id: '3',
          text: `Found: ${state.search.searchValue}`,
          location: 'Layer 3, Item 1'
        }
      ];
    } else {
      state.search.results = [];
    }
  }

  return {
    performReplace(): boolean {
      const { searchValue, replaceValue, results } = state.search;
      if (searchValue && results.length > 0) {
        console.log(
          `[Tools] Replacing "${searchValue}" with "${replaceValue}" in ${results.length} locations`
        );
        state.search.searchValue = '';
        state.search.replaceValue = '';
        state.search.results = [];
        return true;
      }
      return false;
    },

    updateSearch(updates: Partial<ToolState['search']>): void {
      Object.assign(state.search, updates);
      console.log('[Tools] Search updated:', state.search);
      mockSearchResults();
    }
  };
}

export function createLayersActions(state: ToolState) {
  return {
    toggleLayerVisibility(layerId: string): void {
      const layer = getLayerById(state, layerId);
      if (layer) {
        layer.visible = !layer.visible;
        console.log(
          `[Tools] Layer ${layerId} visibility toggled to:`,
          layer.visible
        );
      }
    },

    reorderLayers(fromIndex: number, toIndex: number): void {
      const layers = [...state.layers.layers];
      const [removed] = layers.splice(fromIndex, 1);
      layers.splice(toIndex, 0, removed);
      state.layers.layers = layers;
      console.log('[Tools] Layers reordered:', layers);
    },

    updateLayers(updates: Partial<ToolState['layers']>): void {
      Object.assign(state.layers, updates);
      console.log('[Tools] Layers updated:', state.layers);
    }
  };
}

export function createAnnotationsActions(state: ToolState) {
  return {
    addAnnotation(
      type: 'text' | 'shape' | 'drawing' | 'image',
      content: unknown
    ): void {
      const newAnnotation = {
        id: `annotation-${Date.now()}`,
        type,
        content,
        position: { x: 100, y: 100 }
      };
      state.annotations.items.push(newAnnotation);
      state.annotations.selectedId = newAnnotation.id;
      console.log('[Tools] Annotation added:', newAnnotation);
    },

    removeAnnotation(id: string): void {
      state.annotations.items = state.annotations.items.filter(
        (a) => a.id !== id
      );
      if (state.annotations.selectedId === id) {
        state.annotations.selectedId = null;
      }
      console.log('[Tools] Annotation removed:', id);
    },

    updateAnnotations(updates: Partial<ToolState['annotations']>): void {
      Object.assign(state.annotations, updates);
      console.log('[Tools] Annotations updated:', state.annotations);
    }
  };
}

export function createGeoIndicationsActions(state: ToolState) {
  return {
    toggleScale(): void {
      state.geoIndications.scale.enabled = !state.geoIndications.scale.enabled;
      console.log(
        '[Tools] Geo scale',
        state.geoIndications.scale.enabled ? 'enabled' : 'disabled'
      );
    },

    toggleOrientation(): void {
      state.geoIndications.orientation.enabled =
        !state.geoIndications.orientation.enabled;
      console.log(
        '[Tools] Geo orientation',
        state.geoIndications.orientation.enabled ? 'enabled' : 'disabled'
      );
    },

    toggleInsetMap(): void {
      state.geoIndications.insetMap.enabled =
        !state.geoIndications.insetMap.enabled;
      console.log(
        '[Tools] Geo inset map',
        state.geoIndications.insetMap.enabled ? 'enabled' : 'disabled'
      );
    },

    updateGeoIndications(updates: Partial<ToolState['geoIndications']>): void {
      Object.assign(state.geoIndications, updates);
      console.log('[Tools] Geo Indications updated:', state.geoIndications);
    }
  };
}
