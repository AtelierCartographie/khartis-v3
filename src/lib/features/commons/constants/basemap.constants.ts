export const BASEMAP_LAYER_ID = {
  TERRE: 'terre',
  MERS: 'mers',
  LACS: 'lacs',
  RIVIERES: 'rivieres',
  RELIEF: 'relief',
  EQUATEUR: 'equateur',
  MERIDIENS: 'meridiens',
  FRONTIERES: 'frontieres',
  VILLES: 'villes',
  SPHERE: 'sphere'
} as const;

export type BasemapLayerId =
  (typeof BASEMAP_LAYER_ID)[keyof typeof BASEMAP_LAYER_ID];

export type BasemapRenderGroup = 'background' | 'foreground';

export const BASEMAP_BACKGROUND_LAYER_IDS: readonly BasemapLayerId[] = [
  BASEMAP_LAYER_ID.MERS,
  BASEMAP_LAYER_ID.TERRE,
  BASEMAP_LAYER_ID.LACS,
  BASEMAP_LAYER_ID.RELIEF
] as const;

export function getBasemapRenderGroup(
  layerId: BasemapLayerId
): BasemapRenderGroup {
  return BASEMAP_BACKGROUND_LAYER_IDS.includes(layerId)
    ? 'background'
    : 'foreground';
}
