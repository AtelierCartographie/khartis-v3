import type maplibregl from 'maplibre-gl';

export enum BasemapStyle {
  BLANK_WHITE = 'blank-white',
  CARTO_POSITRON = 'carto-positron',
  CARTO_DARK_MATTER = 'carto-dark',
  CARTO_VOYAGER = 'carto-voyager',
  OSM_LIBERTY = 'osm-liberty'
}

export const BLANK_WHITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  name: 'blank-white',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#ffffff'
      }
    }
  ]
};

export const BASEMAP_STYLES: Record<BasemapStyle, string | maplibregl.StyleSpecification> = {
  [BasemapStyle.BLANK_WHITE]: BLANK_WHITE_STYLE,
  [BasemapStyle.CARTO_POSITRON]:
    'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
  [BasemapStyle.CARTO_DARK_MATTER]:
    'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
  [BasemapStyle.CARTO_VOYAGER]:
    'https://basemaps.cartocdn.com/gl/voyager-nolabels-gl-style/style.json',
  [BasemapStyle.OSM_LIBERTY]: 'https://tiles.openfreemap.org/styles/liberty'
};

export const DEFAULT_BASEMAP_STYLE = BasemapStyle.BLANK_WHITE;
