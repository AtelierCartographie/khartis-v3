import { base } from '$app/paths';
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

const BASEMAP_STYLE_PATHS: Record<BasemapStyle, string | null> = {
  [BasemapStyle.BLANK_WHITE]: null,
  [BasemapStyle.CARTE_FACILE_DESATURATED]:
    '/basemaps/styles/carte-facile-desaturated.json',
  [BasemapStyle.CARTE_FACILE_SIMPLE]:
    '/basemaps/styles/carte-facile-simple.json',
  [BasemapStyle.CARTE_FACILE_AERIAL]:
    '/basemaps/styles/carte-facile-aerial.json'
};

export function getBasemapStyle(
  style: BasemapStyle
): string | maplibregl.StyleSpecification {
  if (style === BasemapStyle.BLANK_WHITE) {
    return BLANK_WHITE_STYLE;
  }
  const path = BASEMAP_STYLE_PATHS[style];
  return path ? `${base}${path}` : BLANK_WHITE_STYLE;
}

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

export const DEFAULT_BASEMAP_STYLE = BasemapStyle.BLANK_WHITE;
