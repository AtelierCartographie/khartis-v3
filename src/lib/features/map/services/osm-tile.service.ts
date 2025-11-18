import type { BasemapMetadata } from '../types/basemap.types';

/**
 * OSM Tile Service
 * Provides tile URL templates and configuration for OpenStreetMap raster tiles
 */

export interface OSMTileConfig {
  urlTemplate: string;
  attribution: string;
  minZoom: number;
  maxZoom: number;
  tileSize: number;
}

const OSM_TILE_SERVERS = {
  'osm-standard': {
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256
  },
  'osm-carto': {
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256
  },
  'osm-humanitarian': {
    urlTemplate: 'https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution:
      '© OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team',
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256
  },
  'osm-transport': {
    urlTemplate: 'https://tile.thunderforest.com/transport/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, Tiles by Thunderforest',
    minZoom: 0,
    maxZoom: 18,
    tileSize: 256
  }
};

/**
 * Detect if a basemap is an OSM raster basemap
 */
export function isOSMBasemap(basemap: BasemapMetadata | null): boolean {
  if (!basemap) return false;
  return basemap.file.startsWith('osm_');
}

/**
 * Extract OSM style from basemap file ID
 * @example 'osm_osm-standard_1234567890' → 'osm-standard'
 */
export function extractOSMStyle(basemapId: string): string | null {
  const match = basemapId.match(/^osm_([^_]+)_\d+$/);
  return match ? match[1] : null;
}

/**
 * Get OSM tile configuration from basemap metadata
 */
export function getOSMTileConfig(
  basemap: BasemapMetadata
): OSMTileConfig | null {
  const style = extractOSMStyle(basemap.file);

  if (!style) {
    return null;
  }

  const config = OSM_TILE_SERVERS[style as keyof typeof OSM_TILE_SERVERS];

  if (!config) {
    return null;
  }

  return config;
}

/**
 * Generate tile URL for specific coordinates
 * Replaces {s}, {z}, {x}, {y} placeholders
 */
export function generateTileURL(
  urlTemplate: string,
  z: number,
  x: number,
  y: number
): string {
  const subdomains = ['a', 'b', 'c'];
  const subdomain = subdomains[Math.floor(Math.random() * subdomains.length)];

  return urlTemplate
    .replace('{s}', subdomain)
    .replace('{z}', z.toString())
    .replace('{x}', x.toString())
    .replace('{y}', y.toString());
}

/**
 * Create MapLibre raster source configuration for OSM tiles
 */
export function createOSMRasterSource(config: OSMTileConfig) {
  return {
    type: 'raster' as const,
    tiles: [config.urlTemplate],
    tileSize: config.tileSize,
    attribution: config.attribution,
    minzoom: config.minZoom,
    maxzoom: config.maxZoom
  };
}

/**
 * Create MapLibre raster layer configuration for OSM tiles
 */
export function createOSMRasterLayer(sourceId: string) {
  return {
    id: `${sourceId}-layer`,
    type: 'raster' as const,
    source: sourceId,
    paint: {
      'raster-opacity': 1
    }
  };
}
