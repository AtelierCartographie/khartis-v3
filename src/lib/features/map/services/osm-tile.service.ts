import { MapLibreLayerType } from '../constants';
import type { BasemapMetadata } from '../types/basemap.types';

export interface OSMTileConfig {
  urlTemplate: string;
  attribution: string;
  minZoom: number;
  maxZoom: number;
  tileSize: number;
}

export function isOSMBasemap(_basemap: BasemapMetadata | null): boolean {
  return false;
}

export function getOSMTileConfig(
  _basemap: BasemapMetadata
): OSMTileConfig | null {
  return null;
}

export function createOSMRasterSource(config: OSMTileConfig) {
  return {
    type: MapLibreLayerType.RASTER as const,
    tiles: [config.urlTemplate],
    tileSize: config.tileSize,
    attribution: config.attribution,
    minzoom: config.minZoom,
    maxzoom: config.maxZoom
  };
}

export function createOSMRasterLayer(sourceId: string) {
  return {
    id: `${sourceId}-layer`,
    type: MapLibreLayerType.RASTER as const,
    source: sourceId,
    paint: {
      'raster-opacity': 1
    }
  };
}
