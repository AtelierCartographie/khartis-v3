import proj4 from 'proj4';
import { geoNaturalEarth1, type GeoProjection } from 'd3-geo';
import {
  geoAitoff,
  geoAugust,
  geoBoggs,
  geoCollignon,
  geoCraster,
  geoEckert1,
  geoEckert2,
  geoEckert3,
  geoEckert4,
  geoEckert5,
  geoFahey,
  geoGinzburg8,
  geoHammer,
  geoHomolosine,
  geoKavrayskiy7,
  geoLagrange,
  geoLarrivee,
  geoLaskowski,
  geoMtFlatPolarParabolic,
  geoMtFlatPolarSinusoidal,
  geoNaturalEarth2,
  geoNellHammer,
  geoPatterson,
  geoRectangularPolyconic,
  geoTimes,
  geoVanDerGrinten2,
  geoVanDerGrinten3,
  geoVanDerGrinten4,
  geoWagner4,
  geoWagner6,
  geoWagner7
} from 'd3-geo-projection';

const RADIANS_TO_DEGREES = 180 / Math.PI;
const DEGREES_TO_RADIANS = Math.PI / 180;

type PointFunction = (
  lambda: number,
  phi: number,
  parameters: Proj4MethodThis
) => [number, number] | null;

interface D3Method {
  /**
   * PROJ short name first, then the names a WKT or PROJJSON may use; the
   * last one is shown to the user.
   */
  names: string[];
  forward: PointFunction;
  inverse: PointFunction;
  /** PROJ parameters the method reads on top of the common ones. */
  parameters?: string[];
}

interface Proj4MethodThis {
  a: number;
  long0?: number;
  lat0?: number;
  lat1?: number;
  x0?: number;
  projStr?: unknown;
  y0?: number;
  [parameter: string]: unknown;
}

interface Proj4Point {
  x: number;
  y: number;
}

// PROJ parameters every method accepts: figure of the Earth, false origin,
// units. Anything else (Hammer's W, a lat_ts…) changes the map.
const COMMON_PARAMETERS = [
  'proj',
  'lon_0',
  'lat_0',
  'x_0',
  'y_0',
  'R',
  'a',
  'b',
  'rf',
  'f',
  'ellps',
  'datum',
  'towgs84',
  'units',
  'to_meter',
  'no_defs',
  'type',
  'wktext',
  'over'
];

// d3 point projection on the unit sphere, y up as in PROJ.
function fromD3(factory: () => GeoProjection): Omit<D3Method, 'names'> {
  const projection = factory()
    .scale(1)
    .translate([0, 0])
    .center([0, 0])
    .rotate([0, 0, 0]);
  return {
    forward: (lambda, phi) => {
      const point = projection([
        lambda * RADIANS_TO_DEGREES,
        phi * RADIANS_TO_DEGREES
      ]);
      return point ? [point[0], -point[1]] : null;
    },
    inverse: (x, y) => {
      const point = projection.invert?.([x, -y]);
      return point
        ? [point[0] * DEGREES_TO_RADIANS, point[1] * DEGREES_TO_RADIANS]
        : null;
    }
  };
}

// PROJ 9 draws Winkel Tripel with lat_1 = 0 unless told otherwise, where d3
// fixes it at acos(2/π): only the formula is shared, so it is written here.
const aitoff = fromD3(geoAitoff);
const winkelTripel: Omit<D3Method, 'names'> = {
  parameters: ['lat_1'],
  forward: (lambda, phi, { lat1 = 0 }) => {
    const point = aitoff.forward(lambda, phi, { a: 1 });
    return point
      ? [(point[0] + lambda * Math.cos(lat1)) / 2, (point[1] + phi) / 2]
      : null;
  },
  inverse: (x, y, parameters) => {
    // Newton iterations from the equirectangular guess, as PROJ does.
    let lambda = x;
    let phi = y;
    for (let iteration = 0; iteration < 25; iteration += 1) {
      const point = winkelTripel.forward(lambda, phi, parameters);
      if (!point) return null;
      const step = 1e-7;
      const dLambda = winkelTripel.forward(lambda + step, phi, parameters);
      const dPhi = winkelTripel.forward(lambda, phi + step, parameters);
      if (!dLambda || !dPhi) return null;
      const a = (dLambda[0] - point[0]) / step;
      const b = (dPhi[0] - point[0]) / step;
      const c = (dLambda[1] - point[1]) / step;
      const d = (dPhi[1] - point[1]) / step;
      const determinant = a * d - b * c;
      const ex = point[0] - x;
      const ey = point[1] - y;
      if (Math.hypot(ex, ey) < 1e-12 || determinant === 0) break;
      lambda -= (d * ex - b * ey) / determinant;
      phi -= (a * ey - c * ex) / determinant;
    }
    return [lambda, phi];
  }
};

// Methods proj4js lacks, drawn by d3 with the PROJ formulas: checked against
// PROJ 9 (gdaltransform on WGS84, lon_0 and false origin included) to the
// millimetre, except Wagner VII, Goode and Boggs (iterative, within 30 m).
// Methods whose d3 version differs (loxim, mbtfpq, fouc, nicol, bertin1953)
// or which interrupt the sphere (igh) are left out.
const D3_METHODS: D3Method[] = [
  {
    names: [
      'hammer',
      'Hammer Eckert-Greifendorff',
      'Hammer_Aitoff',
      'Hammer-Aitoff'
    ],
    ...fromD3(geoHammer)
  },
  {
    names: ['kav7', 'Kavrayskiy_VII', 'Kavrayskiy VII'],
    ...fromD3(geoKavrayskiy7)
  },
  { names: ['wag4', 'Wagner_IV', 'Wagner IV'], ...fromD3(geoWagner4) },
  { names: ['wag6', 'Wagner_VI', 'Wagner VI'], ...fromD3(geoWagner6) },
  { names: ['wag7', 'Wagner_VII', 'Wagner VII'], ...fromD3(geoWagner7) },
  { names: ['eck1', 'Eckert_I', 'Eckert I'], ...fromD3(geoEckert1) },
  { names: ['eck2', 'Eckert_II', 'Eckert II'], ...fromD3(geoEckert2) },
  { names: ['eck3', 'Eckert_III', 'Eckert III'], ...fromD3(geoEckert3) },
  { names: ['eck4', 'Eckert_IV', 'Eckert IV'], ...fromD3(geoEckert4) },
  { names: ['eck5', 'Eckert_V', 'Eckert V'], ...fromD3(geoEckert5) },
  {
    names: ['natearth', 'Natural_Earth', 'Natural Earth'],
    ...fromD3(geoNaturalEarth1)
  },
  {
    names: ['natearth2', 'Natural_Earth_II', 'Natural Earth II'],
    ...fromD3(geoNaturalEarth2)
  },
  { names: ['wintri', 'Winkel_Tripel', 'Winkel Tripel'], ...winkelTripel },
  { names: ['aitoff', 'Aitoff'], ...aitoff },
  { names: ['times', 'Times'], ...fromD3(geoTimes) },
  {
    names: ['mbtfpp', 'McBride-Thomas Flat-Polar Parabolic'],
    ...fromD3(geoMtFlatPolarParabolic)
  },
  {
    names: ['mbtfps', 'McBryde-Thomas Flat-Polar Sine (No. 2)'],
    ...fromD3(geoMtFlatPolarSinusoidal)
  },
  { names: ['collg', 'Collignon'], ...fromD3(geoCollignon) },
  {
    names: ['crast', 'Craster_Parabolic', 'Craster Parabolic'],
    ...fromD3(geoCraster)
  },
  { names: ['fahey', 'Fahey'], ...fromD3(geoFahey) },
  { names: ['larr', 'Larrivee'], ...fromD3(geoLarrivee) },
  { names: ['lask', 'Laskowski'], ...fromD3(geoLaskowski) },
  { names: ['nell_h', 'Nell-Hammer'], ...fromD3(geoNellHammer) },
  { names: ['patterson', 'Patterson'], ...fromD3(geoPatterson) },
  {
    names: ['rpoly', 'Rectangular Polyconic'],
    ...fromD3(geoRectangularPolyconic)
  },
  {
    names: ['vandg2', 'Van_der_Grinten_II', 'van der Grinten II'],
    ...fromD3(geoVanDerGrinten2)
  },
  {
    names: ['vandg3', 'Van_der_Grinten_III', 'van der Grinten III'],
    ...fromD3(geoVanDerGrinten3)
  },
  {
    names: ['vandg4', 'Van_der_Grinten_IV', 'van der Grinten IV'],
    ...fromD3(geoVanDerGrinten4)
  },
  {
    names: ['boggs', 'Boggs_Eumorphic', 'Boggs Eumorphic'],
    ...fromD3(geoBoggs)
  },
  {
    names: ['goode', 'Goode_Homolosine', 'Goode Homolosine'],
    ...fromD3(geoHomolosine)
  },
  { names: ['august', 'August Epicycloidal'], ...fromD3(geoAugust) },
  { names: ['lagrng', 'Lagrange'], ...fromD3(geoLagrange) },
  { names: ['gins8', 'Ginsburg VIII (TsNIIGAiK)'], ...fromD3(geoGinzburg8) }
];

/** PROJ short names proj4js draws through d3. */
export const D3_PROJ4_METHOD_NAMES: ReadonlySet<string> = new Set(
  D3_METHODS.map(({ names }) => names[0])
);

// Keys of a PROJ string; a WKT or PROJJSON carries only the method's own.
function readProjParameters(projStr: unknown): string[] {
  return typeof projStr === 'string' && projStr.trim().startsWith('+')
    ? [...projStr.matchAll(/\+([A-Za-z_0-9]+)/g)].map((match) => match[1])
    : [];
}

/** Readable name of a method proj4js draws through d3, by PROJ short name. */
export function getD3Proj4MethodLabel(projName: string): string | undefined {
  const method = D3_METHODS.find(({ names }) => names[0] === projName);
  return method?.names.at(-1);
}

function wrapRadians(lambda: number): number {
  return Math.atan2(Math.sin(lambda), Math.cos(lambda));
}

function toProj4Projection(method: D3Method) {
  const accepted = new Set([
    ...COMMON_PARAMETERS,
    ...(method.parameters ?? [])
  ]);
  return {
    names: method.names,
    init(this: Proj4MethodThis) {
      const unsupported = readProjParameters(this.projStr).filter(
        (parameter) => !accepted.has(parameter)
      );
      if (unsupported.length > 0 || (this.lat0 ?? 0) !== 0) {
        // Worded like proj4js's own error, so it reads as a missing method.
        throw new Error(
          `Unsupported projection name parameters for ${method.names[0]}: ${unsupported.join(' ') || 'lat_0'}`
        );
      }
      this.long0 = this.long0 ?? 0;
      this.x0 = this.x0 ?? 0;
      this.y0 = this.y0 ?? 0;
    },
    forward(this: Proj4MethodThis, point: Proj4Point) {
      const projected = method.forward(
        wrapRadians(point.x - (this.long0 ?? 0)),
        point.y,
        this
      );
      if (!projected) {
        point.x = Number.NaN;
        point.y = Number.NaN;
        return point;
      }
      point.x = this.a * projected[0] + (this.x0 ?? 0);
      point.y = this.a * projected[1] + (this.y0 ?? 0);
      return point;
    },
    inverse(this: Proj4MethodThis, point: Proj4Point) {
      const geographic = method.inverse(
        (point.x - (this.x0 ?? 0)) / this.a,
        (point.y - (this.y0 ?? 0)) / this.a,
        this
      );
      if (!geographic) {
        point.x = Number.NaN;
        point.y = Number.NaN;
        return point;
      }
      point.x = wrapRadians(geographic[0] + (this.long0 ?? 0));
      point.y = geographic[1];
      return point;
    }
  };
}

let registered = false;

/** Teaches proj4js the PROJ methods it lacks and d3 draws identically. */
export function registerD3Proj4Methods(): void {
  if (registered) {
    return;
  }
  registered = true;
  const registry = (
    proj4 as unknown as {
      Proj: { projections: { add: (projection: unknown) => void } };
    }
  ).Proj.projections;
  for (const method of D3_METHODS) {
    registry.add(toProj4Projection(method));
  }
}
