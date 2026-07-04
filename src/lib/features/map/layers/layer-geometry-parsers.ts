import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { ProjectionLike } from 'geoarrow-deck-stream';

import {
  parsePaths,
  parsePathsWithProjection,
  parsePointData,
  parsePointDataWithProjection,
  parseSolidPolygons,
  parseSolidPolygonsWithProjection
} from '../utils/geoarrow-stream-bridge.utils';

export function resolvePolygonParser(customProjection?: ProjectionLike) {
  return customProjection
    ? (table: ArrowTable) =>
        parseSolidPolygonsWithProjection(table, customProjection)
    : parseSolidPolygons;
}

export function resolvePathParser(customProjection?: ProjectionLike) {
  return customProjection
    ? (table: ArrowTable) => parsePathsWithProjection(table, customProjection)
    : parsePaths;
}

export function resolvePointParser(customProjection?: ProjectionLike) {
  return customProjection
    ? (table: ArrowTable) =>
        parsePointDataWithProjection(table, customProjection)
    : parsePointData;
}
