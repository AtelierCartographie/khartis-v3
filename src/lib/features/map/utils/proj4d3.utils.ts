import proj4 from 'proj4';
import { geoProjection, type GeoProjection } from 'd3-geo';
import {
  normalizeProj4CrsCode,
  registerKnownProj4Definitions,
  WGS84_CRS
} from '$lib/features/commons/utils/proj4-crs.utils';

const RADIANS_TO_DEGREES = 180 / Math.PI;
const DEGREES_TO_RADIANS = Math.PI / 180;

export function proj4d3(definition: string): GeoProjection {
  registerKnownProj4Definitions();

  const converter = proj4(WGS84_CRS, normalizeProj4CrsCode(definition));

  // The raw projection works in radians on input and the proj4 CRS unit on
  // output. Attaching `.invert` to the RAW projection (before geoProjection
  // wraps it) lets d3 layer scale/translate/rotate handling on top — both
  // ways. Setting `.invert` on the wrapped projection instead would bypass
  // that, so `projection.invert(screenPoint)` would feed raw screen pixels
  // straight into proj4's inverse as if they were CRS units (e.g. metres),
  // collapsing every pixel to a near-zero degree delta.
  const raw = ((lambda: number, phi: number) => {
    const [x, y] = converter.forward([
      lambda * RADIANS_TO_DEGREES,
      phi * RADIANS_TO_DEGREES
    ]);
    return [x, y] as [number, number];
  }) as {
    (lambda: number, phi: number): [number, number];
    invert: (x: number, y: number) => [number, number];
  };

  raw.invert = (x: number, y: number) => {
    const [lon, lat] = converter.inverse([x, y]);
    return [lon * DEGREES_TO_RADIANS, lat * DEGREES_TO_RADIANS] as [
      number,
      number
    ];
  };

  return geoProjection(raw);
}
