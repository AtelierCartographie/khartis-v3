import proj4 from 'proj4';
import { registerD3Proj4Methods } from './proj4-d3-methods.utils';
import { get_intersecting_countries } from '@ateliercartographie/proj-suggest';

export const WGS84_CRS = 'EPSG:4326';

export const EPSG_DEFINITIONS: Record<string, string> = {
  'EPSG:2154':
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:3035':
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:27700':
    '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs +type=crs',
  'EPSG:2157':
    '+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=0.99982 +x_0=600000 +y_0=750000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:2056':
    '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs',
  'EPSG:3857':
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs',
  'EPSG:27572':
    '+proj=lcc +lat_1=46.8 +lat_0=46.8 +lon_0=0 +k_0=0.99987742 +x_0=600000 +y_0=2200000 +a=6378249.2 +b=6356515 +towgs84=-168,-60,320,0,0,0,0 +pm=paris +units=m +no_defs +type=crs',
  'EPSG:32631': '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs +type=crs',
  'EPSG:32632': '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs +type=crs',
  [WGS84_CRS]: '+proj=longlat +datum=WGS84 +no_defs +type=crs'
};

export const EPSG_NAMES: Record<string, string> = {
  'EPSG:2154': 'RGF93 v1 / Lambert-93',
  'EPSG:3035': 'ETRS89-extended / LAEA Europe',
  'EPSG:27700': 'OSGB36 / British National Grid',
  'EPSG:2157': 'IRENET95 / Irish Transverse Mercator',
  'EPSG:2056': 'CH1903+ / LV95',
  'EPSG:3857': 'WGS 84 / Pseudo-Mercator',
  'EPSG:27572': 'NTF (Paris) / Lambert zone II',
  'EPSG:31370': 'BD72 / Belgian Lambert 72',
  'EPSG:28992': 'Amersfoort / RD New',
  'EPSG:25832': 'ETRS89 / UTM zone 32N',
  'EPSG:5070': 'NAD83 / Conus Albers',
  'EPSG:3347': 'NAD83 / Statistics Canada Lambert',
  'EPSG:9473': 'GDA2020 / Australian Albers',
  'EPSG:3576': 'WGS 84 / North Pole LAEA Russia',
  [WGS84_CRS]: 'WGS 84'
};

const WORLD_BBOX: [number, number, number, number] = [-180, -90, 180, 90];
const RADIANS_TO_DEGREES = 180 / Math.PI;

// Past these angles from its centre an azimuthal CRS returns no coordinate
// (orthographic back hemisphere, gnomonic horizon) or one that blows up the
// fit (stereographic, LAEA and AEQD antipode). Keyed by proj4's short names.
const AZIMUTHAL_CLIP_ANGLES: Record<string, number | 'horizon'> = {
  ortho: 90,
  gnom: 60,
  stere: 142,
  sterea: 142,
  laea: 179.9,
  aeqd: 179.9,
  geos: 'horizon',
  tpers: 'horizon'
};

// proj4js leaves these undefined when a PROJ.4 string omits them, and aea,
// laea, lcc, cea, somerc… then return NaN for every point. PROJ defaults all
// four to 0.
const PROJ_ZERO_DEFAULT_PARAMETERS = ['lat_0', 'lon_0', 'x_0', 'y_0'] as const;

export type Proj4Crs = InstanceType<typeof proj4.Proj>;

let proj4DefinitionsRegistered = false;

/** A CRS read from the PROJ database of DuckDB (`duckdb_coordinate_systems`). */
export interface ResolvedCoordinateSystem {
  name: string;
  projjson: string;
  renderable: boolean;
}

// null: PROJ does not know the code either.
const resolvedCoordinateSystems = new Map<
  string,
  ResolvedCoordinateSystem | null
>();

export function registerResolvedCoordinateSystem(
  code: string,
  entry: ResolvedCoordinateSystem | null
): void {
  resolvedCoordinateSystems.set(normalizeProj4CrsCode(code), entry);
}

/** undefined: not looked up yet. */
export function getResolvedCoordinateSystem(
  code: string
): ResolvedCoordinateSystem | null | undefined {
  return resolvedCoordinateSystems.get(normalizeProj4CrsCode(code));
}

export function normalizeProj4CrsCode(crs: string): string {
  const trimmed = crs.trim();
  const epsgMatch = trimmed.match(/^EPSG:(\d+)$/i);

  return epsgMatch ? `EPSG:${epsgMatch[1]}` : trimmed;
}

export function completeProj4Defaults(definition: string): string {
  if (!definition.trimStart().startsWith('+')) {
    return definition;
  }

  const missing = PROJ_ZERO_DEFAULT_PARAMETERS.filter(
    (parameter) => !new RegExp(`\\+${parameter}=`).test(definition)
  );

  return missing.length === 0
    ? definition
    : `${definition} ${missing.map((parameter) => `+${parameter}=0`).join(' ')}`;
}

// Accepts an EPSG code known to proj4, a PROJ.4 string, a WKT (1 or 2) or a
// PROJJSON text. Throws when proj4 cannot build the CRS.
export function createProj4Crs(code: string): Proj4Crs {
  registerKnownProj4Definitions();

  const normalized = normalizeProj4CrsCode(code);
  if (normalized.startsWith('{')) {
    return new proj4.Proj(JSON.parse(normalized));
  }
  const resolved = proj4.defs(normalized)
    ? undefined
    : getResolvedCoordinateSystem(normalized);
  if (resolved?.renderable) {
    return new proj4.Proj(JSON.parse(resolved.projjson));
  }

  return new proj4.Proj(completeProj4Defaults(normalized));
}

/** PROJ.4 string of a code proj4 knows by name (EPSG registry, UTM). */
export function getKnownProj4Definition(epsgCode: string): string | undefined {
  registerKnownProj4Definitions();
  const code = normalizeProj4CrsCode(epsgCode);
  const registered = EPSG_DEFINITIONS[code];
  if (registered) {
    return registered;
  }
  const projStr = (proj4.defs(code) as { projStr?: string } | undefined)
    ?.projStr;
  if (projStr) {
    return projStr;
  }
  const utm = code.match(/^EPSG:32([67])(\d{2})$/);
  return utm
    ? `+proj=utm +zone=${Number(utm[2])}${utm[1] === '7' ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`
    : undefined;
}

export function getKnownEpsgName(epsgCode: string): string | undefined {
  const code = normalizeProj4CrsCode(epsgCode);
  const utm = code.match(/^EPSG:32([67])(\d{2})$/);
  if (utm) {
    return `WGS 84 / UTM zone ${Number(utm[2])}${utm[1] === '6' ? 'N' : 'S'}`;
  }
  return EPSG_NAMES[code] ?? getResolvedCoordinateSystem(code)?.name;
}

type Proj4CrsOriginFields = {
  names?: string[];
  projName?: string;
  long0?: number;
  lat0?: number;
  lat_ts?: number;
  from_greenwich?: number;
  a?: number;
  h?: number;
};

export interface Proj4CrsOrigin {
  longitude: number;
  latitude: number;
  clipAngle?: number;
}

function finiteDegrees(radians: number | undefined): number {
  const degrees = (radians ?? 0) * RADIANS_TO_DEGREES;
  return Number.isFinite(degrees) ? degrees : 0;
}

/**
 * Centre of a CRS in degrees: its central meridian (prime meridian included)
 * and, for an azimuthal CRS, its latitude of origin and the clip angle around
 * that centre.
 */
export function readProj4CrsOrigin(crs: Proj4Crs): Proj4CrsOrigin {
  const fields = crs as unknown as Proj4CrsOriginFields;
  const longitude = finiteDegrees(
    (fields.long0 ?? 0) + (fields.from_greenwich ?? 0)
  );
  const method = (fields.names ?? [fields.projName ?? '']).find(
    (name) => name in AZIMUTHAL_CLIP_ANGLES
  );
  if (!method) {
    return { longitude, latitude: 0 };
  }

  const polarLatitude =
    fields.lat0 === undefined && fields.lat_ts !== undefined
      ? Math.sign(fields.lat_ts) * 90
      : undefined;
  const clip = AZIMUTHAL_CLIP_ANGLES[method];
  const horizon =
    clip === 'horizon' && fields.a && fields.h
      ? Math.acos(fields.a / (fields.a + fields.h)) * RADIANS_TO_DEGREES
      : undefined;

  return {
    longitude,
    latitude: polarLatitude ?? finiteDegrees(fields.lat0),
    clipAngle: clip === 'horizon' ? horizon : clip
  };
}

/** Central meridian of a CRS code in degrees, 0 when it cannot be built. */
export function getProjectionCodeCentralMeridian(code: string): number {
  try {
    return readProj4CrsOrigin(createProj4Crs(code)).longitude;
  } catch {
    return 0;
  }
}

// The national CRS that proj-suggest can suggest, so a code pasted by hand
// resolves like the suggestion card does. Khartis' own definitions win.
function listNationalProj4Definitions(): Array<[string, string]> {
  return get_intersecting_countries(WORLD_BBOX)
    .filter((country) => country.epsg && country.proj4)
    .map((country) => [`EPSG:${country.epsg}`, country.proj4]);
}

export function registerKnownProj4Definitions(): void {
  registerD3Proj4Methods();
  if (proj4DefinitionsRegistered) {
    return;
  }

  for (const [code, definition] of listNationalProj4Definitions()) {
    proj4.defs(code, completeProj4Defaults(definition));
  }
  for (const [code, definition] of Object.entries(EPSG_DEFINITIONS)) {
    proj4.defs(code, definition);
  }

  proj4DefinitionsRegistered = true;
}

// Parameters that do not change the projection: their presence or order
// must not hide an EPSG code behind an equivalent PROJ string.
const IGNORED_PROJ4_PARAMETERS = new Set(['no_defs', 'type', 'wktext']);

function canonicalProj4(definition: string): string {
  return definition
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^\+/, ''))
    .filter(
      (token) => token && !IGNORED_PROJ4_PARAMETERS.has(token.split('=')[0])
    )
    .map((token) => {
      const [key, value] = token.split('=');
      if (value === undefined) return key;
      const numbers = value.split(',').map(Number);
      return numbers.every(Number.isFinite)
        ? `${key}=${numbers.join(',')}`
        : `${key}=${value}`;
    })
    .sort()
    .join(' ');
}

/**
 * The EPSG code whose definition is exactly this PROJ string, Khartis' own
 * definitions first. A PROJ string alone lets GIS software guess among
 * several codes with the same parameters (LAEA Europe: 3035 or 5636).
 */
export function findKnownEpsgForProj4(definition: string): string | undefined {
  registerKnownProj4Definitions();
  const target = canonicalProj4(definition);
  const candidates = [
    ...Object.entries(EPSG_DEFINITIONS),
    ...listNationalProj4Definitions()
  ];
  const match = candidates.find(
    ([code, known]) => code !== WGS84_CRS && canonicalProj4(known) === target
  );
  return match?.[0].replace(/^EPSG:/, '');
}
