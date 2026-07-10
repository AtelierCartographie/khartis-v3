import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';

import { arrowTableToGeoJSON } from '../io';
import { projectGeoJSON } from '../utils/geoarrow-stream-bridge.utils';

const geoJsonConversionCache = new WeakMap<
  ArrowTable,
  Map<string, FeatureCollection | null>
>();
const projectedGeoJsonCache = new WeakMap<
  FeatureCollection,
  WeakMap<object, FeatureCollection>
>();

export function getCachedGeoJSON(
  table: ArrowTable,
  geoColumn: string
): FeatureCollection | null {
  let columnMap = geoJsonConversionCache.get(table);
  if (columnMap) {
    const cached = columnMap.get(geoColumn);
    if (cached !== undefined) return cached;
  } else {
    columnMap = new Map();
    geoJsonConversionCache.set(table, columnMap);
  }
  const result = arrowTableToGeoJSON(table, geoColumn);
  columnMap.set(geoColumn, result);
  return result;
}

export function getCachedProjectedGeoJSON<T extends Geometry>(
  geojson: FeatureCollection<T>,
  projection: ProjectionLike | undefined
): FeatureCollection<T> {
  if (!projection) {
    return geojson;
  }

  const projectionKey = projection as ProjectionLike & object;
  let projectionCache = projectedGeoJsonCache.get(geojson);
  const cached = projectionCache?.get(projectionKey) as
    FeatureCollection<T> | undefined;
  if (cached) {
    return cached;
  }

  const projected = projectGeoJSON(geojson, projection) as FeatureCollection<T>;
  if (!projectionCache) {
    projectionCache = new WeakMap<object, FeatureCollection>();
    projectedGeoJsonCache.set(geojson, projectionCache);
  }
  projectionCache.set(projectionKey, projected);
  return projected;
}
