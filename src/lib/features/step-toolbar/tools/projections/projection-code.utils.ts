import { PROJECTIONS } from '$lib/features/commons/utils/projection.utils';
import {
  createProj4Crs,
  getKnownEpsgName,
  getResolvedCoordinateSystem,
  normalizeProj4CrsCode,
  registerKnownProj4Definitions,
  WGS84_CRS,
  type Proj4Crs
} from '$lib/features/commons/utils/proj4-crs.utils';
import proj4 from 'proj4';

const PROJ4_HINT = /^\+|\+proj=/i;
const WKT_HINT =
  /\b(?:PROJCS|GEOGCS|GEOGCRS|GEODCRS|PROJCRS|BOUNDCRS|COMPOUNDCRS|VERTCRS)\b/i;

const DEFAULT_FALLBACK_PROJECTION = 'mercator';

export function inferProjectionIdFromCode(code: string): string | undefined {
  const normalized = code.toLowerCase();

  if (
    normalized.includes('orthographic') ||
    normalized.includes('+proj=ortho') ||
    normalized.includes('sphere')
  ) {
    return 'orthographic';
  }

  if (
    normalized.includes('winkel') ||
    normalized.includes('wintri') ||
    normalized.includes('+proj=wintri')
  ) {
    return 'winkel-tripel';
  }

  if (
    normalized.includes('robinson') ||
    normalized.includes('+proj=robin') ||
    normalized.includes('robin')
  ) {
    return 'robinson';
  }

  if (
    normalized.includes('mollweide') ||
    normalized.includes('+proj=moll') ||
    normalized.includes('moll')
  ) {
    return 'mollweide';
  }

  if (
    normalized.includes('albers') ||
    normalized.includes('+proj=aea') ||
    normalized.includes('equal area conic')
  ) {
    return 'albers';
  }

  if (
    normalized.includes('stereographic') ||
    normalized.includes('+proj=stere') ||
    normalized.includes('sterea')
  ) {
    return 'stereographic';
  }

  if (
    normalized.includes('equirectangular') ||
    normalized.includes('+proj=eqc') ||
    normalized.includes('plate carr') ||
    normalized.includes('longlat') ||
    normalized.includes('lonlat') ||
    normalized.includes('epsg:4326')
  ) {
    return 'equirectangular';
  }

  if (
    normalized.includes('equal earth') ||
    normalized.includes('+proj=eqearth')
  ) {
    return 'equal-earth';
  }

  if (
    normalized.includes('natural earth') ||
    normalized.includes('+proj=natearth')
  ) {
    return 'natural-earth';
  }

  if (
    normalized.includes('cylindrical equal') ||
    normalized.includes('gall') ||
    normalized.includes('+proj=cea')
  ) {
    return 'gall-peters';
  }

  if (normalized.includes('+proj=bonne') || normalized.includes('bonne')) {
    return 'bonne';
  }

  if (normalized.includes('bertin')) {
    return 'bertin-1953';
  }

  if (normalized.includes('interrupted') && normalized.includes('mollweide')) {
    return 'interrupted-mollweide';
  }

  if (
    normalized.includes('+proj=lcc') ||
    normalized.includes('epsg:2154') ||
    normalized.includes('epsg:27572') ||
    normalized.includes('lambert-93')
  ) {
    return 'lambert-conformal';
  }

  if (
    normalized.includes('+proj=tmerc') ||
    normalized.includes('+proj=utm') ||
    normalized.includes('transverse mercator')
  ) {
    return 'transverse-mercator';
  }

  if (normalized.includes('epsg:3035')) {
    return 'azimuthal-equal-area';
  }

  if (
    normalized.includes('mercator') ||
    normalized.includes('+proj=merc') ||
    normalized.includes('epsg:3857')
  ) {
    return 'mercator';
  }

  return undefined;
}

function isKnownProjectionId(projectionId: string): boolean {
  return PROJECTIONS.some((projection) => projection.id === projectionId);
}

export type ProjectionCodeFormat = 'authority' | 'proj4' | 'wkt' | 'projjson';

export interface ProjectionCodeCrs {
  name?: string;
  epsg?: string;
  method: string;
  datum?: string;
  ellipsoid?: string;
  units?: string;
}

// Share of the data extent the CRS can project: d3 drops the points proj4
// cannot compute (back hemisphere of an orthographic, beyond a conic's pole…).
export type ProjectionCodeCoverage = 'full' | 'partial' | 'none';

export type ProjectionCodeDiagnosis =
  | { status: 'empty' }
  | { status: 'unrecognized' }
  /** Not bundled with proj4: the PROJ database of DuckDB has to be read. */
  | { status: 'unresolved-authority-code'; code: string }
  /** Absent from the PROJ database too. */
  | { status: 'unknown-authority-code'; code: string }
  /** PROJ knows it, but proj4js would draw it wrong. */
  | { status: 'unrenderable-crs'; code: string; name: string }
  | {
      status: 'catalogue-equivalent';
      method: string;
      catalogueId: string;
      longitude?: number;
    }
  | { status: 'unsupported-method'; method?: string }
  | { status: 'invalid'; format: ProjectionCodeFormat }
  | {
      status: 'valid';
      format: ProjectionCodeFormat;
      normalizedCode: string;
      projectionId: string;
      crs: ProjectionCodeCrs;
      coverage?: ProjectionCodeCoverage;
    };

type BBox = [number, number, number, number];

const AUTHORITY_CODE = /^(?:EPSG|ESRI)\s*:\s*\d+$/i;
const BARE_EPSG_CODE = /^\d{4,6}$/;

// Projection methods proj4js does not implement but the d3 catalogue draws
// identically (same spherical formulas, scale aside). Keyed by the PROJ short
// name or the WKT method name, lowercased without separators.
const CATALOGUE_EQUIVALENT_METHODS: Record<string, string> = {
  natearth: 'natural-earth',
  naturalearth: 'natural-earth',
  wintri: 'winkel-tripel',
  winkeltripel: 'winkel-tripel',
  aitoff: 'aitoff',
  eck4: 'eckert-4',
  eckertiv: 'eckert-4',
  times: 'times',
  bertin1953: 'bertin-1953'
};

const COVERAGE_GRID_STEPS = 8;

export function normalizeProjectionCodeInput(code: string): string {
  const trimmed = code.trim();
  if (BARE_EPSG_CODE.test(trimmed)) {
    return `EPSG:${trimmed}`;
  }
  if (AUTHORITY_CODE.test(trimmed)) {
    return trimmed.replace(/\s+/g, '').toUpperCase();
  }
  return normalizeProj4CrsCode(trimmed);
}

function detectProjectionCodeFormat(
  code: string
): ProjectionCodeFormat | undefined {
  if (AUTHORITY_CODE.test(code)) return 'authority';
  if (code.startsWith('{')) return 'projjson';
  if (WKT_HINT.test(code)) return 'wkt';
  if (PROJ4_HINT.test(code)) return 'proj4';
  return undefined;
}

function readProjectionMethod(code: string): string | undefined {
  const match =
    code.match(/\+proj=([\w-]+)/i) ??
    code.match(/\b(?:PROJECTION|METHOD)\s*\[\s*"([^"]+)"/i) ??
    code.match(/"method"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"/i);
  return match?.[1];
}

function readCentralMeridian(code: string): number | undefined {
  const match =
    code.match(/\+lon_0=(-?[\d.]+)/i) ??
    code.match(/PARAMETER\s*\[\s*"central_meridian"\s*,\s*(-?[\d.]+)/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

function findCatalogueEquivalent(method: string | undefined) {
  const key = method?.toLowerCase().replace(/[^a-z0-9]/g, '');
  const catalogueId = key ? CATALOGUE_EQUIVALENT_METHODS[key] : undefined;
  return catalogueId && isKnownProjectionId(catalogueId)
    ? catalogueId
    : undefined;
}

type Proj4CrsFields = {
  projName?: string;
  srsCode?: string;
  title?: string;
  AUTHORITY?: { EPSG?: string };
  datumName?: string;
  datumCode?: string;
  ellps?: string;
  units?: string;
};

function summarizeCrs(
  crs: Proj4Crs,
  normalizedCode: string,
  format: ProjectionCodeFormat
): ProjectionCodeCrs {
  const fields = crs as unknown as Proj4CrsFields;
  const epsg =
    normalizedCode.match(/^EPSG:(\d+)$/)?.[1] ??
    fields.AUTHORITY?.EPSG ??
    fields.title?.match(/^EPSG:(\d+)$/)?.[1];
  const knownName = epsg ? getKnownEpsgName(`EPSG:${epsg}`) : undefined;
  const fileName =
    format === 'wkt' || format === 'projjson'
      ? fields.srsCode?.replace(/_/g, ' ')
      : undefined;
  // proj4's display names are misleading ("Lambert Tangential…" for a
  // secant Lambert): show the method as the code spells it.
  const projName = fields.projName ?? '';
  const method =
    format === 'proj4' || format === 'authority'
      ? `+proj=${projName}`
      : projName.replace(/_/g, ' ');
  const datum = fields.datumName ?? fields.datumCode;

  return {
    name: knownName ?? fileName,
    epsg,
    method,
    datum: datum && datum !== 'none' ? datum : undefined,
    ellipsoid: fields.ellps,
    units: fields.units
  };
}

function isFinitePoint(point: unknown): boolean {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1])
  );
}

function measureFiniteShare(crs: Proj4Crs, bbox: BBox): number {
  const converter = proj4(WGS84_CRS, crs);
  const [west, south, east, north] = bbox;
  let finite = 0;
  let total = 0;

  for (let i = 0; i <= COVERAGE_GRID_STEPS; i += 1) {
    for (let j = 0; j <= COVERAGE_GRID_STEPS; j += 1) {
      const lon = west + ((east - west) * i) / COVERAGE_GRID_STEPS;
      const lat = south + ((north - south) * j) / COVERAGE_GRID_STEPS;
      total += 1;
      try {
        if (isFinitePoint(converter.forward([lon, lat]))) finite += 1;
      } catch {
        // proj4 throws for some out-of-domain points; they count as missing.
      }
    }
  }

  return finite / total;
}

function toCoverage(share: number): ProjectionCodeCoverage {
  if (share === 0) return 'none';
  return share < 1 ? 'partial' : 'full';
}

/**
 * Says whether a pasted CRS can drive the map, and why not when it cannot.
 * `bbox` is the lon/lat extent the map is fitted to, when known.
 */
export function diagnoseProjectionCode(
  code: string,
  bbox?: BBox | null
): ProjectionCodeDiagnosis {
  const normalizedCode = normalizeProjectionCodeInput(code);
  if (!normalizedCode) {
    return { status: 'empty' };
  }

  const format = detectProjectionCodeFormat(normalizedCode);
  if (!format) {
    return { status: 'unrecognized' };
  }

  // A code read from the PROJ database is applied as its PROJJSON: the
  // render worker and a reopened project then need no lookup.
  let appliedCode = normalizedCode;
  if (format === 'authority') {
    registerKnownProj4Definitions();
    if (!proj4.defs(normalizedCode)) {
      const resolved = getResolvedCoordinateSystem(normalizedCode);
      if (resolved === undefined) {
        return { status: 'unresolved-authority-code', code: normalizedCode };
      }
      if (resolved === null) {
        return { status: 'unknown-authority-code', code: normalizedCode };
      }
      if (!resolved.renderable) {
        return {
          status: 'unrenderable-crs',
          code: normalizedCode,
          name: resolved.name
        };
      }
      appliedCode = resolved.projjson;
    }
  }

  let crs: Proj4Crs;
  try {
    crs = createProj4Crs(normalizedCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (format === 'projjson' && error instanceof SyntaxError) {
      return { status: 'invalid', format };
    }
    if (!/projection name/i.test(message)) {
      return { status: 'invalid', format };
    }
    const method = readProjectionMethod(normalizedCode);
    const catalogueId = findCatalogueEquivalent(method);
    return catalogueId && method
      ? {
          status: 'catalogue-equivalent',
          method,
          catalogueId,
          longitude: readCentralMeridian(normalizedCode)
        }
      : { status: 'unsupported-method', method };
  }

  if (measureFiniteShare(crs, [-180, -85, 180, 85]) === 0) {
    return { status: 'invalid', format };
  }

  const inferredProjectionId = inferProjectionIdFromCode(normalizedCode);

  return {
    status: 'valid',
    format,
    normalizedCode: appliedCode,
    projectionId:
      inferredProjectionId && isKnownProjectionId(inferredProjectionId)
        ? inferredProjectionId
        : DEFAULT_FALLBACK_PROJECTION,
    crs: summarizeCrs(crs, normalizedCode, format),
    coverage: bbox ? toCoverage(measureFiniteShare(crs, bbox)) : undefined
  };
}

export function wrapLongitude(longitude: number): number {
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && longitude > 0 ? 180 : wrapped;
}

/** The CRS behind a valid code, or undefined when it cannot be built. */
export function describeProjectionCode(
  code: string
): ProjectionCodeCrs | undefined {
  const diagnosis = diagnoseProjectionCode(code);
  return diagnosis.status === 'valid' ? diagnosis.crs : undefined;
}
