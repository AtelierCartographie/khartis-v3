import { MapLibreLayerType, OSMTileServer } from '../constants';
import type { BasemapMetadata } from '../types/basemap.types';

export interface OSMTileConfig {
  urlTemplate: string;
  attribution: string;
  minZoom: number;
  maxZoom: number;
  tileSize: number;
}

const OSM_TILE_SERVERS: Record<OSMTileServer, OSMTileConfig> = {
  [OSMTileServer.STANDARD]: {
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256
  },
  [OSMTileServer.CARTO]: {
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256
  },
  [OSMTileServer.HUMANITARIAN]: {
    urlTemplate: 'https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution:
      '© OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team',
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256
  },
  [OSMTileServer.TRANSPORT]: {
    urlTemplate: 'https://tile.thunderforest.com/transport/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, Tiles by Thunderforest',
    minZoom: 0,
    maxZoom: 18,
    tileSize: 256
  }
};

export function isOSMBasemap(basemap: BasemapMetadata | null): boolean {
  if (!basemap) return false;
  return basemap.file.startsWith('osm_');
}

export function extractOSMStyle(basemapId: string): string | null {
  const match = basemapId.match(/^osm_([^_]+)_\d+$/);
  return match ? match[1] : null;
}

export function getOSMTileConfig(
  basemap: BasemapMetadata
): OSMTileConfig | null {
  const style = extractOSMStyle(basemap.file);

  if (!style) {
    return null;
  }

  const tileServerKey = `osm-${style}` as OSMTileServer;
  const config = OSM_TILE_SERVERS[tileServerKey];

  if (!config) {
    return null;
  }

  return config;
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
