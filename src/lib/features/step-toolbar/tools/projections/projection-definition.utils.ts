import {
  buildProjectionFromCatalogueId,
  getProjectionD3ConfigById,
  resolveProjectionDefaultOrientation
} from '$lib/features/commons/utils/projection.utils';
import { buildD3ProjectionFromConfig } from '$lib/features/commons/utils/d3-projection-config.utils';
import {
  getKnownProj4Definition,
  getProjectionCodeCentralMeridian
} from '$lib/features/commons/utils/proj4-crs.utils';
import { getCompositeProjectionPresetId } from '$lib/features/map/utils/user-projection.utils';
import type { ProjectionPresets } from '$lib/features/map/types/basemap.types';
import type { GeoProjection } from 'd3-geo';
import type { ProjectionState } from '../../types/projections.types';
import { diagnoseProjectionCode, wrapLongitude } from './projection-code.utils';
import type { BasemapProjectionSource } from './projection-label.utils';

export type ProjectionDefinitionNote =
  /** Drawn on a sphere, like d3: exact in QGIS with the same +R. */
  | 'spherical'
  /** Tilted off its normal aspect: no standard CRS reproduces it. */
  | 'oblique'
  /** Turned in the plane: rotate the layout by `rotation`. */
  | 'rotated'
  /** One projection per frame (mainland and insets). */
  | 'composite'
  /** No PROJ method draws it. */
  | 'no-equivalent'
  /** Perspective globe of the tiled engine, not a CRS. */
  | 'globe'
  /** The pasted WKT keeps its own lon_0: use the PROJ string instead. */
  | 'derived-wkt';

export interface ProjectionDefinition {
  proj4?: string;
  /** The WKT or PROJJSON as pasted, when it is exactly what is drawn. */
  wkt?: string;
  epsg?: string;
  rotation?: number;
  notes: ProjectionDefinitionNote[];
}

export interface ProjectionDefinitionContext {
  state: ProjectionState;
  basemapProjection?: BasemapProjectionSource | null;
  projectionPresets?: ProjectionPresets | null;
  /** Set when the tiled (MapLibre) engine draws the map. */
  tiled?: { globe: boolean } | null;
}

// d3 draws on the sphere; the same radius in PROJ gives the same shape.
const SPHERE_RADIUS = '+R=6371000';
const PROJ_SUFFIX = `+x_0=0 +y_0=0 ${SPHERE_RADIUS} +units=m +no_defs`;
const WEB_MERCATOR = 'EPSG:3857';

type D3Aspect = 'azimuthal' | 'conic' | 'transverse' | 'normal';

interface D3ProjMethod {
  proj: string;
  aspect: D3Aspect;
  /** PROJ parameter receiving the single standard parallel. */
  parallel?: 'lat_ts' | 'lat_1';
  /** PROJ hard-codes the orientation: only the d3 default matches. */
  fixedOrientation?: boolean;
}

const D3_PROJ_METHODS: Record<string, D3ProjMethod> = {
  geoMercator: { proj: 'merc', aspect: 'normal' },
  geoNaturalEarth1: { proj: 'natearth', aspect: 'normal' },
  geoNaturalEarth2: { proj: 'natearth2', aspect: 'normal' },
  geoEquirectangular: { proj: 'eqc', aspect: 'normal' },
  geoRobinson: { proj: 'robin', aspect: 'normal' },
  geoWinkel3: { proj: 'wintri', aspect: 'normal' },
  geoAitoff: { proj: 'aitoff', aspect: 'normal' },
  geoMollweide: { proj: 'moll', aspect: 'normal' },
  geoEckert4: { proj: 'eck4', aspect: 'normal' },
  geoEqualEarth: { proj: 'eqearth', aspect: 'normal' },
  geoTimes: { proj: 'times', aspect: 'normal' },
  geoSinusoidal: { proj: 'sinu', aspect: 'normal' },
  geoMiller: { proj: 'mill', aspect: 'normal' },
  geoHammer: { proj: 'hammer', aspect: 'normal' },
  geoCylindricalEqualArea: {
    proj: 'cea',
    aspect: 'normal',
    parallel: 'lat_ts'
  },
  geoBonne: { proj: 'bonne', aspect: 'normal', parallel: 'lat_1' },
  geoBertin1953: {
    proj: 'bertin1953',
    aspect: 'normal',
    fixedOrientation: true
  },
  geoOrthographic: { proj: 'ortho', aspect: 'azimuthal' },
  geoStereographic: { proj: 'stere', aspect: 'azimuthal' },
  geoAzimuthalEqualArea: { proj: 'laea', aspect: 'azimuthal' },
  geoAzimuthalEquidistant: { proj: 'aeqd', aspect: 'azimuthal' },
  geoGnomonic: { proj: 'gnom', aspect: 'azimuthal' },
  geoAlbers: { proj: 'aea', aspect: 'conic' },
  geoConicEqualArea: { proj: 'aea', aspect: 'conic' },
  geoConicConformal: { proj: 'lcc', aspect: 'conic' },
  geoConicEquidistant: { proj: 'eqdc', aspect: 'conic' },
  geoTransverseMercator: { proj: 'tmerc', aspect: 'transverse' },
  geoCassini: { proj: 'cass', aspect: 'transverse' }
};

function formatDegrees(value: number): string {
  return String(Number(value.toFixed(6)));
}

function readParallels(projection: GeoProjection): number[] | undefined {
  const candidate = projection as unknown as {
    parallels?: () => [number, number];
    parallel?: () => number;
  };
  if (typeof candidate.parallels === 'function') {
    return candidate.parallels();
  }
  if (typeof candidate.parallel === 'function') {
    return [candidate.parallel()];
  }
  return undefined;
}

function resolveD3Definition(state: ProjectionState): ProjectionDefinition {
  const config =
    state.suggestionD3Config ?? getProjectionD3ConfigById(state.selected);
  const method = config ? D3_PROJ_METHODS[config.projection] : undefined;
  const projection = state.suggestionD3Config
    ? buildD3ProjectionFromConfig(state.suggestionD3Config)
    : buildProjectionFromCatalogueId(state.selected);
  if (!method || !projection || typeof projection.rotate !== 'function') {
    return { notes: ['no-equivalent'] };
  }

  const [longitude, latitude] = state.center ?? [
    state.longitude,
    state.latitude
  ];
  const [, , gamma = 0] = projection.rotate();
  const notes: ProjectionDefinitionNote[] = ['spherical'];
  const params: string[] = [];

  if (method.fixedOrientation) {
    const [defaultLongitude, defaultLatitude] =
      resolveProjectionDefaultOrientation({
        selected: state.selected,
        suggestionD3Config: state.suggestionD3Config
      });
    if (longitude !== defaultLongitude || latitude !== defaultLatitude) {
      return { notes: ['no-equivalent'] };
    }
  } else {
    if (method.aspect === 'azimuthal') {
      params.push(`+lat_0=${formatDegrees(latitude)}`);
    }
    params.push(`+lon_0=${formatDegrees(wrapLongitude(longitude))}`);
  }

  const parallels = readParallels(projection);
  if (parallels && method.aspect === 'conic') {
    params.push(
      `+lat_1=${formatDegrees(parallels[0])}`,
      `+lat_2=${formatDegrees(parallels[1] ?? parallels[0])}`
    );
  } else if (parallels && method.parallel) {
    params.push(`+${method.parallel}=${formatDegrees(parallels[0])}`);
  }

  // A latitude moves the centre of an azimuthal (lat_0) and only translates a
  // transverse aspect; anywhere else it tilts the projection.
  const tilted =
    (latitude !== 0 &&
      method.aspect !== 'azimuthal' &&
      method.aspect !== 'transverse' &&
      !method.fixedOrientation) ||
    (gamma !== 0 && method.aspect !== 'azimuthal');
  if (tilted) {
    notes.push('oblique');
  }

  const rotation = state.rotation + (method.aspect === 'azimuthal' ? gamma : 0);
  if (rotation !== 0) {
    notes.push('rotated');
  }

  return {
    proj4: [`+proj=${method.proj}`, ...params, PROJ_SUFFIX].join(' '),
    rotation: rotation !== 0 ? rotation : undefined,
    notes
  };
}

function setCentralMeridian(definition: string, longitude: number): string {
  const lon = `+lon_0=${formatDegrees(longitude)}`;
  // PROJ derives a UTM central meridian from its zone and ignores lon_0.
  const utm = definition.match(/\+proj=utm\b/)
    ? definition
        .replace(/\+proj=utm\b/, '+proj=tmerc +lat_0=0 +k=0.9996 +x_0=500000')
        .replace(/\s*\+zone=\d+/, '')
        .replace(/\s*\+south\b/, ' +y_0=10000000')
    : definition;
  return /\+lon_0=\S+/.test(utm)
    ? utm.replace(/\+lon_0=\S+/, lon)
    : `${utm} ${lon}`;
}

function resolveCodeDefinition(
  code: string,
  state: Pick<ProjectionState, 'longitude' | 'latitude' | 'rotation'>
): ProjectionDefinition {
  const diagnosis = diagnoseProjectionCode(code);
  if (diagnosis.status !== 'valid') {
    return { proj4: code, notes: [] };
  }

  const { format, normalizedCode, crs } = diagnosis;
  const proj4String =
    format === 'proj4'
      ? normalizedCode
      : format === 'authority'
        ? getKnownProj4Definition(normalizedCode)
        : undefined;
  const pasted =
    format === 'wkt' || format === 'projjson' ? normalizedCode : undefined;
  const notes: ProjectionDefinitionNote[] = [];

  let definition: ProjectionDefinition;
  if (state.longitude === 0) {
    definition = { proj4: proj4String, wkt: pasted, epsg: crs.epsg, notes };
  } else {
    const longitude = wrapLongitude(
      getProjectionCodeCentralMeridian(normalizedCode) + state.longitude
    );
    if (pasted) {
      notes.push('derived-wkt');
    }
    definition = {
      proj4: proj4String
        ? setCentralMeridian(proj4String, longitude)
        : undefined,
      notes
    };
  }

  if (state.latitude !== 0) {
    notes.push('oblique');
  }
  if (state.rotation !== 0) {
    notes.push('rotated');
    definition.rotation = state.rotation;
  }
  return definition;
}

function resolvePresetDefinition(
  presetId: string,
  projectionPresets?: ProjectionPresets | null
): ProjectionDefinition {
  const epsg = projectionPresets?.[presetId]?.epsg;
  return {
    epsg: epsg ? String(epsg) : undefined,
    proj4: epsg ? getKnownProj4Definition(`EPSG:${epsg}`) : undefined,
    notes: ['composite']
  };
}

function resolveBasemapDefinition(
  source: BasemapProjectionSource | null | undefined,
  projectionPresets?: ProjectionPresets | null
): ProjectionDefinition {
  if (source?.type === 'composite' && source.preset) {
    return resolvePresetDefinition(source.preset, projectionPresets);
  }
  if (source?.type === 'simple' && source.proj4) {
    return resolveCodeDefinition(source.proj4, {
      longitude: 0,
      latitude: 0,
      rotation: 0
    });
  }
  if (source?.nativeEpsg) {
    return {
      epsg: source.nativeEpsg,
      proj4: getKnownProj4Definition(`EPSG:${source.nativeEpsg}`),
      notes: []
    };
  }
  return { notes: ['no-equivalent'] };
}

/**
 * The CRS definition that reproduces the map as drawn, for an expert who
 * combines a Khartis export with a QGIS or ArcGIS one. Follows the same
 * precedence as the current-projection name.
 */
export function resolveCurrentProjectionDefinition({
  state,
  basemapProjection,
  projectionPresets,
  tiled
}: ProjectionDefinitionContext): ProjectionDefinition {
  if (tiled) {
    return tiled.globe
      ? { notes: ['globe'] }
      : {
          epsg: '3857',
          proj4: getKnownProj4Definition(WEB_MERCATOR),
          notes: []
        };
  }

  if (state.overrideActive !== true || state.overrideSource !== 'manual') {
    return resolveBasemapDefinition(basemapProjection, projectionPresets);
  }

  if (state.customCode) {
    return resolveCodeDefinition(state.customCode, state);
  }

  const presetId = getCompositeProjectionPresetId(state.selected);
  if (presetId) {
    return resolvePresetDefinition(presetId, projectionPresets);
  }

  return resolveD3Definition(state);
}
