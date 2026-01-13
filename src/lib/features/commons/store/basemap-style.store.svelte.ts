import type maplibregl from 'maplibre-gl';
import {
  BASEMAP_STYLES,
  BasemapStyle,
  DEFAULT_BASEMAP_STYLE
} from '../../map/constants/basemap-styles';

class BasemapStyleStore {
  private _state = $state({
    selectedStyle: DEFAULT_BASEMAP_STYLE
  });

  get selectedStyle(): BasemapStyle {
    return this._state.selectedStyle;
  }

  get selectedStyleUrl(): string | maplibregl.StyleSpecification {
    return BASEMAP_STYLES[this._state.selectedStyle];
  }

  get requiresMapLibre(): boolean {
    return this._state.selectedStyle !== BasemapStyle.BLANK_WHITE;
  }

  setStyle(style: BasemapStyle): void {
    this._state.selectedStyle = style;
  }
}

export const basemapStyleStore = new BasemapStyleStore();
