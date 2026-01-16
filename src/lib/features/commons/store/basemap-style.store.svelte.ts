import type maplibregl from 'maplibre-gl';
import {
  BasemapStyle,
  DEFAULT_BASEMAP_STYLE,
  getBasemapStyle
} from '../../map/constants/basemap-styles';

class BasemapStyleStore {
  private _state = $state({
    selectedStyle: DEFAULT_BASEMAP_STYLE
  });

  get selectedStyle(): BasemapStyle {
    return this._state.selectedStyle;
  }

  get selectedStyleUrl(): string | maplibregl.StyleSpecification {
    return getBasemapStyle(this._state.selectedStyle);
  }

  get requiresMapLibre(): boolean {
    return this._state.selectedStyle !== BasemapStyle.BLANK_WHITE;
  }

  setStyle(style: BasemapStyle): void {
    this._state.selectedStyle = style;
  }

  reset(): void {
    this._state.selectedStyle = DEFAULT_BASEMAP_STYLE;
  }

  restoreFromSerialized(style: BasemapStyle): void {
    if (!style || !Object.values(BasemapStyle).includes(style)) {
      this.reset();
      return;
    }
    this._state.selectedStyle = style;
  }
}

export const basemapStyleStore = new BasemapStyleStore();
