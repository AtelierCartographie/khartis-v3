import type maplibregl from 'maplibre-gl';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import {
  BasemapStyle,
  DEFAULT_BASEMAP_STYLE,
  getBasemapStyle
} from '../../map/constants/basemap-styles';

function createBasemapStyleStore() {
  const state = $state({
    selectedStyle: DEFAULT_BASEMAP_STYLE,
    referenceBasemapId: null as string | null,
    showLabels: true
  });

  function setReferenceBasemap(id: string | null): void {
    state.referenceBasemapId = id;
    persistenceRegistry.notifyChange('basemapStyle');
  }

  function setStyle(style: BasemapStyle): void {
    state.selectedStyle = style;
    persistenceRegistry.notifyChange('basemapStyle');
  }

  function setShowLabels(show: boolean): void {
    state.showLabels = show;
    persistenceRegistry.notifyChange('basemapStyle');
  }

  function reset(): void {
    state.selectedStyle = DEFAULT_BASEMAP_STYLE;
    state.referenceBasemapId = null;
    state.showLabels = true;
  }

  function restoreFromSerialized(
    style: BasemapStyle,
    referenceBasemapId?: string | null,
    showLabels?: boolean
  ): void {
    if (!style || !Object.values(BasemapStyle).includes(style)) {
      reset();
      return;
    }
    state.selectedStyle = style;
    if (referenceBasemapId !== undefined) {
      state.referenceBasemapId = referenceBasemapId;
    }
    if (showLabels !== undefined) {
      state.showLabels = showLabels;
    }
  }

  return {
    get selectedStyle(): BasemapStyle {
      return state.selectedStyle;
    },
    get selectedStyleUrl(): string | maplibregl.StyleSpecification {
      return getBasemapStyle(state.selectedStyle);
    },
    get requiresMapLibre(): boolean {
      return state.selectedStyle !== BasemapStyle.BLANK_WHITE;
    },
    get referenceBasemapId(): string | null {
      return state.referenceBasemapId;
    },
    get showLabels(): boolean {
      return state.showLabels;
    },
    setReferenceBasemap,
    setStyle,
    setShowLabels,
    reset,
    restoreFromSerialized
  };
}

export const basemapStyleStore = createBasemapStyleStore();

persistenceRegistry.register({
  key: 'basemapStyle',
  serialize: () => ({
    style: basemapStyleStore.selectedStyle,
    referenceBasemapId: basemapStyleStore.referenceBasemapId,
    showLabels: basemapStyleStore.showLabels
  }),
  deserialize: (data: unknown) => {
    const d = data as {
      style?: string;
      referenceBasemapId?: string | null;
      showLabels?: boolean;
    };
    basemapStyleStore.restoreFromSerialized(
      d.style as Parameters<typeof basemapStyleStore.restoreFromSerialized>[0],
      d.referenceBasemapId,
      d.showLabels
    );
  },
  reset: () => basemapStyleStore.reset(),
  priority: 'debounced'
});
