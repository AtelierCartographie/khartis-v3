import { MapLibreLayerType } from '../constants';
import type { BasemapMetadata } from '../types/basemap.types';

export const OSM_BASEMAP_ID_PREFIX = 'osm_';

export interface OSMTileConfig {
  urlTemplate: string;
  attribution: string;
  minZoom: number;
  maxZoom: number;
  tileSize: number;
}

export function isOSMBasemapFileId(fileId: string): boolean {
  return fileId.startsWith(OSM_BASEMAP_ID_PREFIX);
}

export function isOSMBasemap(basemap: BasemapMetadata | null): boolean {
  return basemap !== null && isOSMBasemapFileId(basemap.file);
}

function isOSMTileConfig(value: unknown): value is OSMTileConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OSMTileConfig>;
  return (
    typeof candidate.urlTemplate === 'string' &&
    candidate.urlTemplate.length > 0 &&
    typeof candidate.attribution === 'string' &&
    Number.isFinite(candidate.minZoom) &&
    Number.isFinite(candidate.maxZoom) &&
    Number.isFinite(candidate.tileSize)
  );
}

export function getOSMTileConfig(
  basemap: BasemapMetadata
): OSMTileConfig | null {
  if (!isOSMBasemap(basemap) || !('osmTileConfig' in basemap)) {
    return null;
  }

  return isOSMTileConfig(basemap.osmTileConfig) ? basemap.osmTileConfig : null;
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
