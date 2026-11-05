import proj4 from 'proj4';
import { geoProjection, geoRotation, type GeoProjection } from 'd3-geo';
import {
  createProj4Crs,
  readProj4CrsOrigin,
  WGS84_CRS
} from '$lib/features/commons/utils/proj4-crs.utils';

const RADIANS_TO_DEGREES = 180 / Math.PI;
const DEGREES_TO_RADIANS = Math.PI / 180;

export interface Proj4d3Options {
  /**
   * Rotate the d3 frame onto the CRS centre (central meridian, and latitude of
   * origin for an azimuthal CRS) and give the raw projection the reverse
   * rotation: the output is unchanged, but d3 then cuts at the meridian
   * opposite the CRS's own, and clips an azimuthal CRS around its centre.
   */
  orient?: boolean;
}

export function proj4d3(
  definition: string,
  { orient = true }: Proj4d3Options = {}
): GeoProjection {
  const crs = createProj4Crs(definition);
  const converter = proj4(WGS84_CRS, crs);
  const origin = orient
    ? readProj4CrsOrigin(crs)
    : { longitude: 0, latitude: 0, clipAngle: undefined };
  const frame: [number, number] = [-origin.longitude, -origin.latitude];
  const toFrame = geoRotation(frame);
  // Shifting the longitude back by addition, unwrapped, keeps the two edges
  // d3 cuts at λ = ±180° on their own side: proj4 wraps lon − lon_0 itself,
  // whereas geoRotation would fold both edges onto -180°.
  const toGeographic =
    origin.latitude === 0
      ? ([lon, lat]: [number, number]): [number, number] => [
          lon + origin.longitude,
          lat
        ]
      : (point: [number, number]) => toFrame.invert(point) as [number, number];

  // The raw projection works in radians on input and the proj4 CRS unit on
  // output. Attaching `.invert` to the RAW projection (before geoProjection
  // wraps it) lets d3 layer scale/translate/rotate handling on top — both
  // ways. Setting `.invert` on the wrapped projection instead would bypass
  // that, so `projection.invert(screenPoint)` would feed raw screen pixels
  // straight into proj4's inverse as if they were CRS units (e.g. metres),
  // collapsing every pixel to a near-zero degree delta.
  const raw = ((lambda: number, phi: number) => {
    const geographic = toGeographic([
      lambda * RADIANS_TO_DEGREES,
      phi * RADIANS_TO_DEGREES
    ]);
    const [x, y] = converter.forward(geographic);
    return [x, y] as [number, number];
  }) as {
    (lambda: number, phi: number): [number, number];
    invert: (x: number, y: number) => [number, number];
  };

  raw.invert = (x: number, y: number) => {
    const [lon, lat] = toFrame(converter.inverse([x, y]));
    return [lon * DEGREES_TO_RADIANS, lat * DEGREES_TO_RADIANS] as [
      number,
      number
    ];
  };

  const projection = geoProjection(raw).rotate(frame);
  if (origin.clipAngle !== undefined) {
    projection.clipAngle(origin.clipAngle);
  }
  return projection;
}
