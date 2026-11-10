import {
  buildProjectionFromCatalogueId,
  getProjectionD3ConfigById,
  resolveProjectionDefaultOrientation
} from '$lib/features/commons/utils/projection.utils';
import { buildD3ProjectionFromConfig } from '$lib/features/commons/utils/d3-projection-config.utils';
import {
  createProj4Crs,
  getKnownProj4Definition,
  getProjectionCodeCentralMeridian,
  WGS84_CRS
} from '$lib/features/commons/utils/proj4-crs.utils';
import proj4 from 'proj4';
import { getCompositeProjectionPresetId } from '$lib/features/map/utils/user-projection.utils';
import type { ProjectionPresets } from '$lib/features/map/types/basemap.types';
import { geoRotation, type GeoProjection } from 'd3-geo';
import type { ProjectionState } from '../../types/projections.types';
import { diagnoseProjectionCode, wrapLongitude } from './projection-code.utils';
import type { BasemapProjectionSource } from './projection-label.utils';

export type ProjectionDefinitionNote =
  /** Drawn on a sphere, like d3: exact in QGIS with the same +R. */
  | 'spherical'
  /** Tilted off its normal aspect in a way PROJ cannot express. */
  | 'oblique'
  /** Tilted by the latitude: a PROJ oblique transformation (ob_tran). */
  | 'oblique-transformation'
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
  /**
   * The map is `base` drawn after a d3 rotation of the sphere by
   * [-longitude, -latitude]: `proj4` is then the matching ob_tran string.
   */
  obliqueBase?: ObliqueBase;
  /**
   * The d3 rotation [-longitude, -latitude] a PROJ method builds in (Bertin
   * 1953): the sphere is cut after it, not along the antimeridian.
   */
  builtInOrientation?: [number, number];
}

export interface ObliqueBase {
  proj4: string;
  longitude: number;
  latitude: number;
}

export interface ProjectionDefinitionContext {
  state: ProjectionState;
  basemapProjection?: BasemapProjectionSource | null;
  projectionPresets?: ProjectionPresets | null;
  /** Set when the tiled (MapLibre) engine draws the map. */
  tiled?: { globe: boolean } | null;
}

// d3 draws on the sphere; the same radius in PROJ gives the same shape.
const SPHERE_RADIUS_METRES = 6371000;
const SPHERE_RADIUS = `+R=${SPHERE_RADIUS_METRES}`;
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
  /** Parameters d3 fixes where PROJ defaults otherwise. */
  fixed?: string;
}

const D3_PROJ_METHODS: Record<string, D3ProjMethod> = {
  geoMercator: { proj: 'merc', aspect: 'normal' },
  geoNaturalEarth1: { proj: 'natearth', aspect: 'normal' },
  geoNaturalEarth2: { proj: 'natearth2', aspect: 'normal' },
  geoEquirectangular: { proj: 'eqc', aspect: 'normal' },
  geoRobinson: { proj: 'robin', aspect: 'normal' },
  // PROJ 9 defaults Winkel Tripel to lat_1 = 0; d3 uses acos(2/π).
  geoWinkel3: { proj: 'wintri', aspect: 'normal', fixed: '+lat_1=50.4597752' },
  geoAitoff: { proj: 'aitoff', aspect: 'normal' },
  geoMollweide: { proj: 'moll', aspect: 'normal' },
  geoEckert4: { proj: 'eck4', aspect: 'normal' },
  geoEqualEarth: { proj: 'eqearth', aspect: 'normal' },
  geoTimes: { proj: 'times', aspect: 'normal' },
  geoSinusoidal: { proj: 'sinu', aspect: 'normal' },
  geoMiller: { proj: 'mill', aspect: 'normal' },
  geoHammer: { proj: 'hammer', aspect: 'normal' },
  geoKavrayskiy7: { proj: 'kav7', aspect: 'normal' },
  geoWagner4: { proj: 'wag4', aspect: 'normal' },
  geoWagner6: { proj: 'wag6', aspect: 'normal' },
  geoWagner7: { proj: 'wag7', aspect: 'normal' },
  geoEckert1: { proj: 'eck1', aspect: 'normal' },
  geoEckert2: { proj: 'eck2', aspect: 'normal' },
  geoEckert3: { proj: 'eck3', aspect: 'normal' },
  geoEckert5: { proj: 'eck5', aspect: 'normal' },
  geoEckert6: { proj: 'eck6', aspect: 'normal' },
  geoPatterson: { proj: 'patterson', aspect: 'normal' },
  geoBoggs: { proj: 'boggs', aspect: 'normal' },
  geoHomolosine: { proj: 'goode', aspect: 'normal' },
  geoCraster: { proj: 'crast', aspect: 'normal' },
  geoCollignon: { proj: 'collg', aspect: 'normal' },
  geoLarrivee: { proj: 'larr', aspect: 'normal' },
  geoLaskowski: { proj: 'lask', aspect: 'normal' },
  geoNellHammer: { proj: 'nell_h', aspect: 'normal' },
  geoMtFlatPolarParabolic: { proj: 'mbtfpp', aspect: 'normal' },
  geoMtFlatPolarSinusoidal: { proj: 'mbtfps', aspect: 'normal' },
  geoVanDerGrinten: { proj: 'vandg', aspect: 'normal' },
  geoVanDerGrinten2: { proj: 'vandg2', aspect: 'normal' },
  geoVanDerGrinten3: { proj: 'vandg3', aspect: 'normal' },
  geoVanDerGrinten4: { proj: 'vandg4', aspect: 'normal' },
  geoRectangularPolyconic: { proj: 'rpoly', aspect: 'normal' },
  geoFahey: { proj: 'fahey', aspect: 'normal' },
  geoAugust: { proj: 'august', aspect: 'normal' },
  geoLagrange: { proj: 'lagrng', aspect: 'normal' },
  geoGinzburg8: { proj: 'gins8', aspect: 'normal' },
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
  return String(Number(value.toFixed(6)) || 0);
}

const ELLIPSOID_PARAMETER = /\+(?:ellps|datum|R|a)=/;

// d3 tilts the sphere ([-longitude, -latitude]) before the base projection.
// In PROJ, ob_tran places the original north pole at (o_lon_p, o_lat_p) of
// the rotated sphere, and the base's own central meridian shifts o_lon_p:
// checked against PROJ 9 (gdaltransform) to the millimetre.
function toObliqueTransformation({
  proj4: base,
  longitude,
  latitude
}: ObliqueBase): string {
  const [poleLongitude, poleLatitude] = geoRotation([-longitude, -latitude, 0])(
    [0, 90]
  );
  const baseLongitude = Number(base.match(/\+lon_0=(\S+)/)?.[1] ?? 0);
  const inner = base
    .replace(/^\s*\+proj=/, '')
    .replace(/\s*\+lon_0=\S+/, '')
    .replace(/\s*\+no_defs\b/, '');
  return [
    `+proj=ob_tran +o_proj=${inner}`,
    // PROJ requires a figure of the Earth where proj4 assumes WGS84.
    ELLIPSOID_PARAMETER.test(base) ? undefined : '+ellps=WGS84',
    `+o_lon_p=${formatDegrees(wrapLongitude(-poleLongitude - baseLongitude))}`,
    `+o_lat_p=${formatDegrees(poleLatitude)}`,
    `+lon_0=${formatDegrees(wrapLongitude(longitude + poleLongitude))}`,
    '+no_defs'
  ]
    .filter(Boolean)
    .join(' ');
}

function obliqueDefinition(
  obliqueBase: ObliqueBase,
  notes: ProjectionDefinitionNote[]
): ProjectionDefinition {
  return {
    proj4: toObliqueTransformation(obliqueBase),
    obliqueBase,
    notes: [...notes, 'oblique-transformation']
  };
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

function resolveD3Source(
  state: ProjectionState
): { method: D3ProjMethod; projection: GeoProjection } | null {
  const config =
    state.suggestionD3Config ?? getProjectionD3ConfigById(state.selected);
  const method = config ? D3_PROJ_METHODS[config.projection] : undefined;
  const projection = state.suggestionD3Config
    ? buildD3ProjectionFromConfig(state.suggestionD3Config)
    : buildProjectionFromCatalogueId(state.selected);
  return method && projection && typeof projection.rotate === 'function'
    ? { method, projection }
    : null;
}

function resolveD3Definition(state: ProjectionState): ProjectionDefinition {
  const source = resolveD3Source(state);
  if (!source) {
    return { notes: ['no-equivalent'] };
  }
  const { method, projection } = source;

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

  if (method.fixed) {
    params.push(method.fixed);
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
  // transverse aspect; anywhere else it tilts the projection, which ob_tran
  // expresses. An intrinsic roll (Atlantis) has no PROJ equivalent, except
  // for a transverse aspect (d3 builds Cassini that way), where it is the
  // aspect itself.
  const rolled =
    gamma !== 0 &&
    method.aspect !== 'azimuthal' &&
    method.aspect !== 'transverse';
  const tilted =
    latitude !== 0 &&
    method.aspect !== 'azimuthal' &&
    method.aspect !== 'transverse' &&
    !method.fixedOrientation;
  if (rolled) {
    notes.push('oblique');
  }

  const rotation = state.rotation + (method.aspect === 'azimuthal' ? gamma : 0);
  if (rotation !== 0) {
    notes.push('rotated');
  }

  const definition: ProjectionDefinition =
    tilted && !rolled
      ? obliqueDefinition(
          {
            proj4: [
              `+proj=${method.proj}`,
              ...params.filter((param) => !param.startsWith('+lon_0=')),
              PROJ_SUFFIX
            ].join(' '),
            longitude,
            latitude
          },
          notes
        )
      : {
          proj4: [`+proj=${method.proj}`, ...params, PROJ_SUFFIX].join(' '),
          notes: tilted ? [...notes, 'oblique'] : notes,
          ...(method.fixedOrientation
            ? { builtInOrientation: [longitude, latitude] as [number, number] }
            : {})
        };
  return { ...definition, rotation: rotation !== 0 ? rotation : undefined };
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

// EPSG parameters holding the central meridian of a conversion.
const CENTRAL_MERIDIAN_PARAMETER_CODES = new Set([8802, 8822]);

interface ProjJsonParameter {
  value?: unknown;
  unit?: unknown;
  id?: { authority?: unknown; code?: unknown };
}

// PROJJSON writes a unit as "degree" or as an object with its factor.
function isDegreeUnit(unit: unknown): boolean {
  if (unit === undefined || unit === 'degree') {
    return true;
  }
  const factor = (unit as { conversion_factor?: unknown } | null)
    ?.conversion_factor;
  return typeof factor === 'number' && Math.abs(factor - Math.PI / 180) < 1e-12;
}

/**
 * A PROJJSON with its central meridian moved, which GDAL and QGIS read as
 * is. Its EPSG id no longer applies and is dropped. Undefined when the
 * conversion names no central meridian.
 */
function setProjJsonCentralMeridian(
  projJson: string,
  longitude: number
): string | undefined {
  let crs: {
    name?: unknown;
    id?: unknown;
    conversion?: { parameters?: ProjJsonParameter[] };
  };
  try {
    crs = JSON.parse(projJson);
  } catch {
    return undefined;
  }
  const parameter = crs.conversion?.parameters?.find(
    ({ id }) =>
      id?.authority === 'EPSG' &&
      CENTRAL_MERIDIAN_PARAMETER_CODES.has(Number(id.code))
  );
  if (!parameter || !isDegreeUnit(parameter.unit)) {
    return undefined;
  }
  parameter.value = Number(formatDegrees(longitude));
  delete crs.id;
  if (typeof crs.name === 'string') {
    crs.name = `${crs.name} (lon_0=${formatDegrees(longitude)})`;
  }
  return JSON.stringify(crs);
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
    // A CRS read from a `.prj` or the PROJ database is held as PROJJSON.
    const derivedProjJson = normalizedCode.startsWith('{')
      ? setProjJsonCentralMeridian(normalizedCode, longitude)
      : undefined;
    if (pasted && !derivedProjJson) {
      notes.push('derived-wkt');
    }
    definition = {
      proj4: proj4String
        ? setCentralMeridian(proj4String, longitude)
        : undefined,
      wkt: derivedProjJson,
      notes
    };
  }

  if (state.latitude !== 0) {
    // proj4d3 then leaves the CRS frame alone and the settings rotate the
    // sphere before it, longitude included (see buildFittedUserProjection).
    definition = proj4String
      ? obliqueDefinition(
          {
            // UTM carries its central meridian in the zone number.
            proj4: setCentralMeridian(
              proj4String,
              getProjectionCodeCentralMeridian(normalizedCode)
            ),
            longitude: state.longitude,
            latitude: state.latitude
          },
          []
        )
      : { notes: ['oblique'] };
  }
  if (state.rotation !== 0) {
    definition.notes.push('rotated');
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
    const code = `EPSG:${source.nativeEpsg}`;
    return {
      epsg: source.nativeEpsg,
      proj4: getKnownProj4Definition(code),
      notes: []
    };
  }
  if (source?.nativeCrs) {
    return resolveCodeDefinition(source.nativeCrs, {
      longitude: 0,
      latitude: 0,
      rotation: 0
    });
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

export type ProjectionForward = (
  lonLat: [number, number]
) => [number, number] | null;

const UNGEOREFERENCEABLE_NOTES: ProjectionDefinitionNote[] = [
  'oblique',
  'composite',
  'no-equivalent',
  'globe'
];

/** Whether the definition is a CRS the map follows up to an affine map. */
export function isGeoreferenceableDefinition(
  definition: ProjectionDefinition
): boolean {
  return (
    Boolean(definition.proj4 || definition.wkt || definition.epsg) &&
    !definition.notes.some((note) => UNGEOREFERENCEABLE_NOTES.includes(note))
  );
}

function finitePoint(point: unknown): [number, number] | null {
  return Array.isArray(point) &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1])
    ? [point[0], point[1]]
    : null;
}

function createProj4Forward(code: string): ProjectionForward | null {
  const build = (definition: string) =>
    proj4(WGS84_CRS, createProj4Crs(definition));
  let converter: ReturnType<typeof build>;
  try {
    converter = build(code);
  } catch {
    // proj4js only runs a spherical transverse Mercator with +approx; PROJ
    // reads the string without it.
    try {
      converter = build(`${code} +approx`);
    } catch {
      return null;
    }
  }
  return (lonLat) => {
    try {
      return finitePoint(converter.forward(lonLat));
    } catch {
      return null;
    }
  };
}

function createDefinitionForward(
  definition: ProjectionDefinition
): ProjectionForward | null {
  const code =
    definition.proj4 ??
    definition.wkt ??
    (definition.epsg ? `EPSG:${definition.epsg}` : undefined);
  return code ? createProj4Forward(code) : null;
}

// The map as Khartis draws it: the d3 tilt, then the base CRS. proj4js runs
// ob_tran for a few inner methods only (cea gives NaN).
function createObliqueForward({
  proj4: base,
  longitude,
  latitude
}: ObliqueBase): ProjectionForward | null {
  const baseForward = createProj4Forward(base);
  if (!baseForward) {
    return null;
  }
  const tilt = geoRotation([-longitude, -latitude, 0]);
  return (lonLat) => baseForward(tilt(lonLat) as [number, number]);
}

/**
 * Coordinates, in the CRS of `resolveCurrentProjectionDefinition`, of a
 * lon/lat point drawn on the map. Null when the map follows no CRS.
 */
export function createCurrentProjectionForward(
  context: ProjectionDefinitionContext,
  definition: ProjectionDefinition = resolveCurrentProjectionDefinition(context)
): ProjectionForward | null {
  if (!isGeoreferenceableDefinition(definition)) {
    return null;
  }

  return definition.obliqueBase
    ? createObliqueForward(definition.obliqueBase)
    : createDefinitionForward(definition);
}
