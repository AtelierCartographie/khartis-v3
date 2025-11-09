declare module 'd3-geo-projection' {
  import type { GeoProjection } from 'd3-geo';

  export function geoNaturalEarth1(): GeoProjection;
  export function geoRobinson(): GeoProjection;
  export function geoWinkelTriple(): GeoProjection;
  export function geoAitoff(): GeoProjection;
  export function geoMollweide(): GeoProjection;
}
