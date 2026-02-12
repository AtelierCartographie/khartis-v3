import { PROJECTIONS } from '$lib/features/commons/utils/projection.utils';
import proj4 from 'proj4';

const PROJ4_HINT = /(?:\+proj=|EPSG:\d+)/i;
const WKT_HINT =
  /\b(?:PROJCS|GEOGCS|GEODCRS|PROJCRS|BOUNDCRS|COMPOUNDCRS|VERTCRS)\b/i;

const CUSTOM_PROJECTION_ALIAS = 'CUSTOM:INPUT';

export interface ParsedProjectionCode {
  normalizedCode: string;
  format: 'wkt' | 'proj4';
  projectionId: string;
}

function inferProjectionId(code: string): string {
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
    normalized.includes('natural earth') ||
    normalized.includes('+proj=natearth') ||
    normalized.includes('eqearth')
  ) {
    return 'natural-earth';
  }

  if (
    normalized.includes('mercator') ||
    normalized.includes('+proj=merc') ||
    normalized.includes('epsg:3857')
  ) {
    return 'mercator';
  }

  return 'mercator';
}

function isKnownProjectionId(projectionId: string): boolean {
  return PROJECTIONS.some((projection) => projection.id === projectionId);
}

function validateWithProj4(code: string): boolean {
  try {
    proj4(code, 'EPSG:4326', [0, 0]);
    return true;
  } catch {
    try {
      proj4.defs(CUSTOM_PROJECTION_ALIAS, code);
      const definition = proj4.defs(CUSTOM_PROJECTION_ALIAS);
      return definition !== undefined;
    } catch {
      return false;
    }
  }
}

export function parseProjectionCode(code: string): ParsedProjectionCode | null {
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    return null;
  }

  let format: 'wkt' | 'proj4' | null = null;
  if (WKT_HINT.test(normalizedCode)) {
    format = 'wkt';
  } else if (PROJ4_HINT.test(normalizedCode)) {
    format = 'proj4';
  }

  if (!format) {
    return null;
  }

  if (!validateWithProj4(normalizedCode)) {
    return null;
  }

  const inferredProjectionId = inferProjectionId(normalizedCode);
  const projectionId = isKnownProjectionId(inferredProjectionId)
    ? inferredProjectionId
    : 'mercator';

  return {
    normalizedCode,
    format,
    projectionId
  };
}
