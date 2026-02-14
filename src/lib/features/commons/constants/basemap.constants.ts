/**
 * Basemap layer constants
 *
 * Layer identifiers for basemap rendering and configuration.
 * These IDs are used across basemap layers, stores, and UI components.
 */

export const BASEMAP_LAYER_ID = {
  TERRE: 'terre',
  MERS: 'mers',
  LACS: 'lacs',
  RIVIERES: 'rivieres',
  RELIEF: 'relief',
  EQUATEUR: 'equateur',
  MERIDIENS: 'meridiens',
  FRONTIERES: 'frontieres',
  VILLES: 'villes'
} as const;

export type BasemapLayerId =
  (typeof BASEMAP_LAYER_ID)[keyof typeof BASEMAP_LAYER_ID];

export const BASEMAP_LAYER_IDS = Object.values(
  BASEMAP_LAYER_ID
) as readonly BasemapLayerId[];

export const BASEMAP_SOURCE_TYPE = {
  CATALOG: 'catalog',
  CUSTOM: 'custom',
  OSM: 'osm'
} as const;

export type BasemapSourceTypeValue =
  (typeof BASEMAP_SOURCE_TYPE)[keyof typeof BASEMAP_SOURCE_TYPE];
