import proj4, { type Converter } from 'proj4';
import * as m from '$lib/paraglide/messages';
import { GEO_CONSTANTS } from '../constants';
import {
  EPSG_DEFINITIONS,
  normalizeProj4CrsCode,
  registerKnownProj4Definitions
} from '$lib/features/commons/utils/proj4-crs.utils';

export { EPSG_DEFINITIONS };

function initializeProj4(): void {
  registerKnownProj4Definitions();
}

export function isProjectionSupported(epsgCode: string): boolean {
  initializeProj4();
  const normalized = normalizeProj4CrsCode(epsgCode);
  return normalized in EPSG_DEFINITIONS || proj4.defs(normalized) !== undefined;
}

interface ReprojectResult {
  success: boolean;
  coordinates?: [number, number];
  error?: string;
}

interface ConverterCacheEntry {
  converter: Converter | null;
}

const converterCache = new Map<string, ConverterCacheEntry>();

function resolveConverter(fromCRS: string, toCRS: string): ConverterCacheEntry {
  const cacheKey = `${fromCRS}::${toCRS}`;
  const cached = converterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  initializeProj4();
  const fromNormalized = normalizeProj4CrsCode(fromCRS);
  const toNormalized = normalizeProj4CrsCode(toCRS);
  const entry: ConverterCacheEntry = isProjectionSupported(fromNormalized)
    ? { converter: proj4(fromNormalized, toNormalized) }
    : { converter: null };

  converterCache.set(cacheKey, entry);
  return entry;
}

export function reprojectPoint(
  x: number,
  y: number,
  fromCRS: string,
  toCRS: string = GEO_CONSTANTS.WGS84_CRS
): ReprojectResult {
  try {
    const { converter } = resolveConverter(fromCRS, toCRS);

    if (!converter) {
      return {
        success: false,
        error: m.error_unsupported_source_projection({ fromCRS })
      };
    }

    const result = converter.forward([x, y]);

    if (!result || !isFinite(result[0]) || !isFinite(result[1])) {
      return {
        success: false,
        error: m.error_reprojection_invalid()
      };
    }

    return {
      success: true,
      coordinates: result as [number, number]
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Unknown reprojection error'
    };
  }
}
