import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import {
  ArrowExtension,
  COMPATIBLE_GEOMETRY_TYPES,
  GeoArrowMetadataKey,
  GeoColumnName,
  GeoJsonFeatureType,
  GeoJsonGeometryType,
  GEO_EXTENSION_TO_TYPE,
  GEO_TYPE_TO_EXTENSION,
  GEOJSON_GEOMETRY_TYPES,
  GeometryType,
  WKBGeometryTypeCode
} from '../constants';
import type { GeometryInfo } from '../types';

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
    (GEOJSON_GEOMETRY_TYPES as readonly string[]).includes(g.type as string) &&
    Array.isArray(g.coordinates)
  );
}

export function parseGeoArrowNative(coords: unknown[]): Geometry | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;

  const first = coords[0];

  if (typeof first === 'number') {
    return {
      type: GeoJsonGeometryType.Point,
      coordinates: coords as [number, number]
    };
  }

  if (!Array.isArray(first)) return null;

  const second = first[0];

  if (typeof second === 'number') {
    return {
      type: GeoJsonGeometryType.LineString,
      coordinates: coords as [number, number][]
    };
  }

  if (!Array.isArray(second)) return null;

  const third = second[0];

  if (typeof third === 'number') {
    return {
      type: GeoJsonGeometryType.Polygon,
      coordinates: coords as [number, number][][]
    };
  }

  if (!Array.isArray(third)) return null;

  const fourth = third[0];

  if (typeof fourth === 'number') {
    return {
      type: GeoJsonGeometryType.MultiPolygon,
      coordinates: coords as [number, number][][][]
    };
  }

  if (Array.isArray(fourth)) {
    const fifth = fourth[0];
    if (typeof fifth === 'number') {
      return {
        type: GeoJsonGeometryType.MultiLineString,
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
      case WKBGeometryTypeCode.POINT:
        return { type: GeoJsonGeometryType.Point, coordinates: readPoint() };

      case WKBGeometryTypeCode.LINESTRING: {
        const numPoints = readUint32();
        const coords: [number, number][] = [];
        for (let i = 0; i < numPoints; i++) {
          coords.push(readPoint());
        }
        return { type: GeoJsonGeometryType.LineString, coordinates: coords };
      }

      case WKBGeometryTypeCode.POLYGON:
        return { type: GeoJsonGeometryType.Polygon, coordinates: readPolygon() };

      case WKBGeometryTypeCode.MULTIPOINT: {
        const numPoints = readUint32();
        const points: [number, number][] = [];
        for (let i = 0; i < numPoints; i++) {
          offset += 5;
          points.push(readPoint());
        }
        return { type: GeoJsonGeometryType.MultiPoint, coordinates: points };
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
        return { type: GeoJsonGeometryType.MultiLineString, coordinates: lines };
      }

      case WKBGeometryTypeCode.MULTIPOLYGON: {
        const numPolygons = readUint32();
        const polygons: [number, number][][][] = [];
        for (let i = 0; i < numPolygons; i++) {
          offset += 5;
          polygons.push(readPolygon());
        }
        return { type: GeoJsonGeometryType.MultiPolygon, coordinates: polygons };
      }

      default:
        logger.warn('Unsupported WKB geometry type', LogCategory.MAP, {
          geomType
        });
        return null;
    }
  } catch (e) {
    logger.warn('Failed to parse WKB geometry', LogCategory.MAP, {
      error: e
    });
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
      logger.warn('No geometry vector found for fallback', LogCategory.MAP, {
        geoColumn
      });
      return null;
    }

    const firstGeom = geomVector.get(0);
    const parsedFirstGeom = parseGeoJsonGeometry(firstGeom);
    if (!parsedFirstGeom) {
      let geomDetails: Record<string, unknown> = {
        geoColumn,
        sampleGeomType: typeof firstGeom,
        isArray: Array.isArray(firstGeom),
        isString: typeof firstGeom === 'string',
        isUint8Array: firstGeom instanceof Uint8Array,
        isArrayBufferView: ArrayBuffer.isView(firstGeom),
        isArrayBuffer: firstGeom instanceof ArrayBuffer
      };

      if (firstGeom && typeof firstGeom === 'object') {
        const obj = firstGeom as Record<string, unknown>;
        geomDetails = {
          ...geomDetails,
          objectKeys: Object.keys(obj).slice(0, 10),
          hasToArray: typeof obj.toArray === 'function',
          hasValues: typeof obj.values === 'function',
          constructorName: obj.constructor?.name
        };

        if (typeof obj.toArray === 'function') {
          try {
            const arr = (obj as { toArray: () => unknown[] }).toArray();
            geomDetails.toArrayResult = Array.isArray(arr)
              ? `Array[${arr.length}]`
              : typeof arr;
            if (Array.isArray(arr) && arr.length > 0) {
              geomDetails.firstElement = typeof arr[0];
            }
          } catch {
            geomDetails.toArrayError = true;
          }
        }
      }

      logger.warn(
        'Geometry is not in GeoJSON format, cannot use fallback',
        LogCategory.MAP,
        geomDetails
      );
      return null;
    }

    for (let i = 0; i < table.numRows; i++) {
      const properties: Record<string, unknown> = {};

      for (const field of table.schema.fields) {
        if (
          field.name === geoColumn ||
          field.name === GeoColumnName.GEOM ||
          field.name === GeoColumnName.GEOMETRY
        )
          continue;
        const col = table.getChild(field.name);
        if (col) {
          const val = col.get(i);
          properties[field.name] =
            typeof val === 'bigint' ? Number(val) : val;
        }
      }

      const geom = geomVector.get(i);
      const parsedGeom = parseGeoJsonGeometry(geom);
      if (parsedGeom) {
        features.push({
          type: GeoJsonFeatureType.FEATURE,
          properties,
          geometry: parsedGeom
        });
      }
    }

    return { type: GeoJsonFeatureType.FEATURE_COLLECTION, features };
  } catch (error) {
    logger.error(
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

    const isWkbEncoded = arrowExtension === ArrowExtension.OGC_WKB;
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
    logger.error('Failed to extract geometry info', LogCategory.MAP, error);
    return null;
  }
}
