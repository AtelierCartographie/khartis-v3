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
