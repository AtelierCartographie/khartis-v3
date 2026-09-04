import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';

const WORLD_LAND_GEOMETRY_PATH = '/basemaps/geometry/world-110m-land-line.json';

export interface WorldLandGeometry {
  land: FeatureCollection;
  borders: FeatureCollection;
}

let cache: WorldLandGeometry | null = null;
let inflight: Promise<WorldLandGeometry | null> | null = null;

export function getWorldLandGeometrySync(): WorldLandGeometry | null {
  return cache;
}

export function loadWorldLandGeometry(): Promise<WorldLandGeometry | null> {
  if (cache) {
    return Promise.resolve(cache);
  }
  inflight ??= fetchWorldLandGeometry().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchWorldLandGeometry(): Promise<WorldLandGeometry | null> {
  try {
    const response = await fetch(
      resolveStaticAssetUrl(WORLD_LAND_GEOMETRY_PATH)
    );
    if (!response.ok) {
      logger.error(
        `World land geometry fetch failed (${response.status})`,
        LogCategory.MAP
      );
      return null;
    }

    const topology = (await response.json()) as Topology;
    const rawLand = topology.objects.land;
    const rawLines = topology.objects.line;
    if (!rawLand || !rawLines) {
      logger.error(
        'World land topology is missing land/line objects',
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
    logger.error('Failed to load world land geometry', LogCategory.MAP, error);
    return null;
  }
}
