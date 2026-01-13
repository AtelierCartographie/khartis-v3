import type maplibregl from 'maplibre-gl';
import { MapLibreLayerType } from './map.constants';

export enum BasemapStyle {
  BLANK_WHITE = 'blank-white',
  CARTE_FACILE_DESATURATED = 'carte-facile-desaturated',
  CARTE_FACILE_SIMPLE = 'carte-facile-simple',
  CARTE_FACILE_AERIAL = 'carte-facile-aerial'
}

const BLANK_WHITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: BasemapStyle.BLANK_WHITE,
  sources: {},
  layers: [
    {
      id: MapLibreLayerType.BACKGROUND,
      type: MapLibreLayerType.BACKGROUND,
      paint: {
        'background-color': '#ffffff'
      }
    }
  ]
};

export const BASEMAP_STYLES: Record<
  BasemapStyle,
  string | maplibregl.StyleSpecification
> = {
  [BasemapStyle.BLANK_WHITE]: BLANK_WHITE_STYLE,
  [BasemapStyle.CARTE_FACILE_DESATURATED]:
    '/basemaps/styles/carte-facile-desaturated.json',
  [BasemapStyle.CARTE_FACILE_SIMPLE]:
    '/basemaps/styles/carte-facile-simple.json',
  [BasemapStyle.CARTE_FACILE_AERIAL]:
    '/basemaps/styles/carte-facile-aerial.json'
};

export const DEFAULT_BASEMAP_STYLE = BasemapStyle.CARTE_FACILE_DESATURATED;
