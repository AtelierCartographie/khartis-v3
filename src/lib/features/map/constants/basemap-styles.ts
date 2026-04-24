import type maplibregl from 'maplibre-gl';
import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';
import { MapLibreLayerType } from './map.constants';

export enum BasemapStyle {
  BLANK_WHITE = 'blank-white',
  FRANCE_COULEURS = 'france-couleurs',
  FRANCE_NIVEAUX_DE_GRIS = 'france-niveaux-de-gris',
  FRANCE_SATELLITE = 'france-satellite',
  MONDE_COULEURS = 'monde-couleurs',
  MONDE_NIVEAUX_DE_GRIS = 'monde-niveaux-de-gris',
  MONDE_SATELLITE = 'monde-satellite'
}

export const DEFAULT_TILED_BASEMAP_STYLE = BasemapStyle.MONDE_COULEURS;

type BasemapStyleResult = string | maplibregl.StyleSpecification;
export type BasemapZone = 'france' | 'monde';
export type BasemapViewportBounds = [[number, number], [number, number]];

export interface BasemapViewportPreset {
  zone: BasemapZone;
  center: [number, number];
  zoom: number;
  bounds: BasemapViewportBounds;
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
  [BasemapStyle.FRANCE_COULEURS]: '/basemaps/styles/france-couleurs.json',
  [BasemapStyle.FRANCE_NIVEAUX_DE_GRIS]:
    '/basemaps/styles/france-niveaux-de-gris.json',
  [BasemapStyle.FRANCE_SATELLITE]: '/basemaps/styles/france-satellite.json',
  [BasemapStyle.MONDE_COULEURS]: '/basemaps/styles/monde-couleurs.json',
  [BasemapStyle.MONDE_NIVEAUX_DE_GRIS]:
    '/basemaps/styles/monde-niveaux-de-gris.json',
  [BasemapStyle.MONDE_SATELLITE]: '/basemaps/styles/monde-satellite.json'
};

const FRANCE_VIEWPORT_PRESET: BasemapViewportPreset = {
  zone: 'france',
  center: [2.5, 46.7],
  zoom: 4.8,
  bounds: [
    [-5.8, 41.0],
    [10.2, 51.8]
  ]
};

const WORLD_VIEWPORT_PRESET: BasemapViewportPreset = {
  zone: 'monde',
  center: [0, 20],
  zoom: 1.25,
  bounds: [
    [-170, -55],
    [170, 80]
  ]
};

const BASEMAP_VIEWPORT_PRESETS: Record<
  BasemapStyle,
  BasemapViewportPreset | null
> = {
  [BasemapStyle.BLANK_WHITE]: null,
  [BasemapStyle.FRANCE_COULEURS]: FRANCE_VIEWPORT_PRESET,
  [BasemapStyle.FRANCE_NIVEAUX_DE_GRIS]: FRANCE_VIEWPORT_PRESET,
  [BasemapStyle.FRANCE_SATELLITE]: FRANCE_VIEWPORT_PRESET,
  [BasemapStyle.MONDE_COULEURS]: WORLD_VIEWPORT_PRESET,
  [BasemapStyle.MONDE_NIVEAUX_DE_GRIS]: WORLD_VIEWPORT_PRESET,
  [BasemapStyle.MONDE_SATELLITE]: WORLD_VIEWPORT_PRESET
};

export function getBasemapStyle(style: BasemapStyle): BasemapStyleResult {
  if (style === BasemapStyle.BLANK_WHITE) {
    return BLANK_WHITE_STYLE;
  }

  const path = BASEMAP_STYLE_PATHS[style];

  return path ? resolveStaticAssetUrl(path) : BLANK_WHITE_STYLE;
}

export function getBasemapViewportPreset(
  style: BasemapStyle
): BasemapViewportPreset | null {
  return BASEMAP_VIEWPORT_PRESETS[style];
}

export function getBasemapZone(style: BasemapStyle): BasemapZone | null {
  return getBasemapViewportPreset(style)?.zone ?? null;
}

export const DEFAULT_BASEMAP_STYLE = BasemapStyle.BLANK_WHITE;
