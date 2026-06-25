import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';

const THUMBNAIL_GEOMETRY_PATH = '/basemaps/geometry/world-110m-land-line.json';

export interface ThumbnailGeometry {
  land: FeatureCollection;
  borders: FeatureCollection;
}

let cache: ThumbnailGeometry | null = null;
let inflight: Promise<ThumbnailGeometry | null> | null = null;

export function getThumbnailGeometrySync(): ThumbnailGeometry | null {
  return cache;
}

export function loadThumbnailGeometry(): Promise<ThumbnailGeometry | null> {
  if (cache) {
    return Promise.resolve(cache);
  }
  inflight ??= fetchThumbnailGeometry().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchThumbnailGeometry(): Promise<ThumbnailGeometry | null> {
  try {
    const response = await fetch(
      resolveStaticAssetUrl(THUMBNAIL_GEOMETRY_PATH)
    );
    if (!response.ok) {
      logger.error(
        `Projection thumbnail geometry fetch failed (${response.status})`,
        LogCategory.MAP
      );
      return null;
    }

    const topology = (await response.json()) as Topology;
    const rawLand = topology.objects.land;
    const rawLines = topology.objects.line;
    if (!rawLand || !rawLines) {
      logger.error(
        'Projection thumbnail topology is missing land/line objects',
        LogCategory.MAP
      );
      return null;
    }

    cache = {
      land: feature(topology, rawLand as GeometryCollection),
      borders: feature(topology, rawLines as GeometryCollection)
    };
    return cache;
  } catch (error) {
    logger.error(
      'Failed to load projection thumbnail geometry',
      LogCategory.MAP,
      error
    );
    return null;
  }
}
