import type maplibregl from 'maplibre-gl';
import {
  BASEMAP_STYLES,
  BasemapStyle,
  DEFAULT_BASEMAP_STYLE
} from '../../map/configs/basemap-styles';

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

  setStyle(style: BasemapStyle): void {
    this._state.selectedStyle = style;
  }
}

export const basemapStyleStore = new BasemapStyleStore();
