import type maplibregl from 'maplibre-gl';
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
  }

  function setStyle(style: BasemapStyle): void {
    state.selectedStyle = style;
  }

  function setShowLabels(show: boolean): void {
    state.showLabels = show;
  }

  function reset(): void {
    state.selectedStyle = DEFAULT_BASEMAP_STYLE;
    state.referenceBasemapId = null;
    state.showLabels = true;
  }

  function restoreFromSerialized(
    style: BasemapStyle,
    referenceBasemapId?: string | null
  ): void {
    if (!style || !Object.values(BasemapStyle).includes(style)) {
      reset();
      return;
    }
    state.selectedStyle = style;
    if (referenceBasemapId !== undefined) {
      state.referenceBasemapId = referenceBasemapId;
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
