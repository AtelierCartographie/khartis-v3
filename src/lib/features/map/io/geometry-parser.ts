import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import {
  ArrowExtension,
  COMPATIBLE_GEOMETRY_TYPES,
  GeoArrowMetadataKey,
  GEO_EXTENSION_TO_TYPE,
  GEO_TYPE_TO_EXTENSION,
  GeometryType,
  WKBGeometryTypeCode
} from '../constants';
import type { GeometryInfo } from '../types';
import {
  GEOJSON_TYPE,
  SIMPLE_GEOMETRY_TYPES
} from '$lib/features/commons/constants';

const VALID_LNG_RANGE = { min: -180, max: 180 };
const VALID_LAT_RANGE = { min: -90, max: 90 };

export function isValidCoordinate(lng: number, lat: number): boolean {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return false;
  }
  if (lng < VALID_LNG_RANGE.min || lng > VALID_LNG_RANGE.max) {
    return false;
  }
  if (lat < VALID_LAT_RANGE.min || lat > VALID_LAT_RANGE.max) {
    return false;
  }
  return true;
}

export function validateCoordinates(coords: [number, number][]): boolean {
  for (const [lng, lat] of coords) {
    if (!isValidCoordinate(lng, lat)) {
      return false;
    }
  }
  return true;
}

export function isGeoJsonGeometry(geom: unknown): geom is Geometry {
  if (!geom) return false;

  if (typeof geom === 'string') {
    try {
      const parsed = JSON.parse(geom);
      return isGeoJsonGeometry(parsed);
    } catch {
      return false;
    }
  }

  if (typeof geom !== 'object') return false;
  const g = geom as Record<string, unknown>;
  return (
    typeof g.type === 'string' &&
    (SIMPLE_GEOMETRY_TYPES as readonly string[]).includes(g.type as string) &&
    Array.isArray(g.coordinates)
  );
}

export function parseGeoArrowNative(coords: unknown[]): Geometry | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;

  const first = coords[0];

  if (typeof first === 'number') {
    const [lng, lat] = coords as [number, number];
    if (!isValidCoordinate(lng, lat)) {
      return null;
    }
    return {
      type: GEOJSON_TYPE.POINT,
      coordinates: coords as [number, number]
    };
  }

  if (!Array.isArray(first)) return null;

  const second = first[0];

  if (typeof second === 'number') {
    const lineCoords = coords as [number, number][];
    if (!validateCoordinates(lineCoords)) {
      return null;
    }
    return {
      type: GEOJSON_TYPE.LINE_STRING,
      coordinates: lineCoords
    };
  }

  if (!Array.isArray(second)) return null;

  const third = second[0];

  if (typeof third === 'number') {
    return {
      type: GEOJSON_TYPE.POLYGON,
      coordinates: coords as [number, number][][]
    };
  }

  if (!Array.isArray(third)) return null;

  const fourth = third[0];

  if (typeof fourth === 'number') {
    return {
      type: GEOJSON_TYPE.MULTI_POLYGON,
      coordinates: coords as [number, number][][][]
    };
  }

  if (Array.isArray(fourth)) {
    const fifth = fourth[0];
    if (typeof fifth === 'number') {
      return {
        type: GEOJSON_TYPE.MULTI_LINE_STRING,
        coordinates: coords as [number, number][][]
      };
    }
  }

  return null;
}

export function parseWkbToGeoJson(wkb: Uint8Array): Geometry | null {
  if (wkb.length < 5) return null;

  const littleEndian = wkb[0] === 1;
  const view = new DataView(wkb.buffer, wkb.byteOffset, wkb.byteLength);
  const geomType = view.getUint32(1, littleEndian);

  let offset = 5;

  const readDouble = (): number => {
    const val = view.getFloat64(offset, littleEndian);
    offset += 8;
    return val;
  };

  const readUint32 = (): number => {
    const val = view.getUint32(offset, littleEndian);
    offset += 4;
    return val;
  };

  const readPoint = (): [number, number] => {
    return [readDouble(), readDouble()];
  };

  const readLinearRing = (): [number, number][] => {
    const numPoints = readUint32();
    const ring: [number, number][] = [];
    for (let i = 0; i < numPoints; i++) {
      ring.push(readPoint());
    }
    return ring;
  };

  const readPolygon = (): [number, number][][] => {
    const numRings = readUint32();
    const rings: [number, number][][] = [];
    for (let i = 0; i < numRings; i++) {
      rings.push(readLinearRing());
    }
    return rings;
  };

  try {
    switch (geomType) {
      case WKBGeometryTypeCode.POINT: {
        const point = readPoint();
        if (!isValidCoordinate(point[0], point[1])) {
          return null;
        }
        return { type: GEOJSON_TYPE.POINT, coordinates: point };
      }

      case WKBGeometryTypeCode.LINESTRING: {
        const numPoints = readUint32();
        const coords: [number, number][] = [];
        for (let i = 0; i < numPoints; i++) {
          coords.push(readPoint());
        }
        return { type: GEOJSON_TYPE.LINE_STRING, coordinates: coords };
      }

      case WKBGeometryTypeCode.POLYGON:
        return {
          type: GEOJSON_TYPE.POLYGON,
          coordinates: readPolygon()
        };

      case WKBGeometryTypeCode.MULTIPOINT: {
        const numPoints = readUint32();
        const points: [number, number][] = [];
        for (let i = 0; i < numPoints; i++) {
          offset += 5;
          points.push(readPoint());
        }
        return { type: GEOJSON_TYPE.MULTI_POINT, coordinates: points };
      }

      case WKBGeometryTypeCode.MULTILINESTRING: {
        const numLines = readUint32();
        const lines: [number, number][][] = [];
        for (let i = 0; i < numLines; i++) {
          offset += 5;
          const numPoints = readUint32();
          const line: [number, number][] = [];
          for (let j = 0; j < numPoints; j++) {
            line.push(readPoint());
          }
          lines.push(line);
        }
        return {
          type: GEOJSON_TYPE.MULTI_LINE_STRING,
          coordinates: lines
        };
      }

      case WKBGeometryTypeCode.MULTIPOLYGON: {
        const numPolygons = readUint32();
        const polygons: [number, number][][][] = [];
        for (let i = 0; i < numPolygons; i++) {
          offset += 5;
          polygons.push(readPolygon());
        }
        return {
          type: GEOJSON_TYPE.MULTI_POLYGON,
          coordinates: polygons
        };
      }

      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function parseGeoJsonGeometry(geom: unknown): Geometry | null {
  if (!geom) return null;

  if (typeof geom === 'string') {
    try {
      const parsed = JSON.parse(geom);
      if (isGeoJsonGeometry(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  if (geom instanceof Uint8Array) {
    return parseWkbToGeoJson(geom);
  }

  if (ArrayBuffer.isView(geom)) {
    const uint8 = new Uint8Array(
      (geom as ArrayBufferView).buffer,
      (geom as ArrayBufferView).byteOffset,
      (geom as ArrayBufferView).byteLength
    );
    return parseWkbToGeoJson(uint8);
  }

  if (geom instanceof ArrayBuffer) {
    return parseWkbToGeoJson(new Uint8Array(geom));
  }

  if (Array.isArray(geom)) {
    return parseGeoArrowNative(geom);
  }

  if (
    typeof geom === 'object' &&
    geom !== null &&
    typeof (geom as { toArray?: () => unknown }).toArray === 'function'
  ) {
    const arr = (geom as { toArray: () => unknown }).toArray();
    if (arr instanceof Uint8Array) {
      return parseWkbToGeoJson(arr);
    }
    if (ArrayBuffer.isView(arr)) {
      const uint8 = new Uint8Array(
        (arr as ArrayBufferView).buffer,
        (arr as ArrayBufferView).byteOffset,
        (arr as ArrayBufferView).byteLength
      );
      return parseWkbToGeoJson(uint8);
    }
    if (Array.isArray(arr)) {
      if (arr.length > 0 && typeof arr[0] === 'number') {
        const uint8 = new Uint8Array(arr as number[]);
        if (uint8.length >= 5 && (uint8[0] === 0 || uint8[0] === 1)) {
          return parseWkbToGeoJson(uint8);
        }
      }
      return parseGeoArrowNative(arr);
    }
  }

  if (isGeoJsonGeometry(geom)) {
    return geom;
  }

  return null;
}

export function arrowTableToGeoJSON(
  table: ArrowTable,
  geoColumn: string
): FeatureCollection | null {
  try {
    const features: FeatureCollection['features'] = [];
    const geomVector = table.getChild(geoColumn);

    if (!geomVector) {
      return null;
    }

    const firstGeom = geomVector.get(0);
    const parsedFirstGeom = parseGeoJsonGeometry(firstGeom);
    if (!parsedFirstGeom) {
      return null;
    }

    // Pre-fetch column vectors once — avoids repeated getChild() lookups
    // inside the O(n×m) loop (n rows × m columns).
    const propertyColumns: Array<{
      name: string;
      vector: NonNullable<ReturnType<ArrowTable['getChild']>>;
    }> = [];
    for (const field of table.schema.fields) {
      if (
        field.name === geoColumn ||
        field.name === INTERNAL_COLUMN.GEOM ||
        field.name === INTERNAL_COLUMN.GEOMETRY
      )
        continue;
      const col = table.getChild(field.name);
      if (col) {
        propertyColumns.push({ name: field.name, vector: col });
      }
    }

    for (let i = 0; i < table.numRows; i++) {
      const properties: Record<string, unknown> = {};

      for (const { name, vector } of propertyColumns) {
        const val = vector.get(i);
        properties[name] = typeof val === 'bigint' ? Number(val) : val;
      }

      const geom = geomVector.get(i);
      const parsedGeom = parseGeoJsonGeometry(geom);
      if (parsedGeom) {
        features.push({
          type: GEOJSON_TYPE.FEATURE,
          properties,
          geometry: parsedGeom
        });
      }
    }

    return { type: GEOJSON_TYPE.FEATURE_COLLECTION, features };
  } catch (error) {
    logger.warn(
      'Failed to convert Arrow table to GeoJSON',
      LogCategory.MAP,
      error
    );
    return null;
  }
}

export function areGeometryTypesCompatible(
  metadataType: string,
  extensionType: string
): boolean {
  if (metadataType === extensionType) return true;
  const compatible = COMPATIBLE_GEOMETRY_TYPES[metadataType as GeometryType];
  return compatible?.includes(extensionType as GeometryType) ?? false;
}

export function extractGeometryInfo(table: ArrowTable): GeometryInfo | null {
  const geoMetadata = table.schema.metadata?.get(GeoArrowMetadataKey.GEO);
  if (!geoMetadata) {
    return null;
  }

  try {
    const jsonMeta = JSON.parse(geoMetadata);
    const geoColumn = jsonMeta.primary_column;
    const geometryType = jsonMeta.columns[geoColumn].geometry_types[0];
    const normalizedGeometryType = geometryType.toUpperCase() as GeometryType;

    const geometryField = table.schema.fields.find(
      (field) => field.name === geoColumn
    );
    const arrowExtensionRaw =
      geometryField?.metadata?.get(GeoArrowMetadataKey.EXTENSION_NAME) ?? null;
    const arrowExtension = arrowExtensionRaw
      ? arrowExtensionRaw.toLowerCase()
      : null;

    const expectedExtension =
      GEO_TYPE_TO_EXTENSION[normalizedGeometryType] ?? null;
    const extensionGeometryType = arrowExtension
      ? GEO_EXTENSION_TO_TYPE[arrowExtension]
      : null;

    const hasMatchingGeoExtension =
      arrowExtension && expectedExtension
        ? arrowExtension === expectedExtension ||
          (extensionGeometryType
            ? areGeometryTypesCompatible(
                normalizedGeometryType,
                extensionGeometryType
              )
            : false)
        : false;

    const resolvedGeometryType =
      extensionGeometryType ?? normalizedGeometryType;

    // geoarrow.wkb (DuckDB >= 1.33) is included: geoarrow-deck-stream
    // transparently decodes WKB in all parse functions.
    const isNativeGeoArrow = Boolean(
      arrowExtension &&
      (arrowExtension.startsWith('geoarrow.') ||
        arrowExtension === ArrowExtension.GEOARROW_POINT ||
        arrowExtension === ArrowExtension.GEOARROW_MULTIPOINT ||
        arrowExtension === ArrowExtension.GEOARROW_LINESTRING ||
        arrowExtension === ArrowExtension.GEOARROW_MULTILINESTRING ||
        arrowExtension === ArrowExtension.GEOARROW_POLYGON ||
        arrowExtension === ArrowExtension.GEOARROW_MULTIPOLYGON)
    );

    const isWkbEncoded =
      arrowExtension === ArrowExtension.OGC_WKB ||
      arrowExtension === ArrowExtension.GEOARROW_WKB;
    const isGeoJsonEncoded = arrowExtension === ArrowExtension.GEOJSON;

    if (!hasMatchingGeoExtension) {
      logger.warn('Geometry extension mismatch detected', LogCategory.MAP, {
        geometryType: resolvedGeometryType,
        arrowExtension,
        expectedExtension
      });
    }

    return {
      type: resolvedGeometryType,
      encoding: arrowExtension,
      geoColumn,
      isNativeGeoArrow,
      isWkbEncoded,
      isGeoJsonEncoded
    };
  } catch (error) {
    logger.warn('Failed to extract geometry info', LogCategory.MAP, error);
    return null;
  }
}
