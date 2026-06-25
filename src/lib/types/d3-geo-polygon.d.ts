declare module 'd3-geo-polygon' {
  import type { GeoProjection, GeoRawProjection, GeoStream } from 'd3-geo';
  import type { MultiPolygon, Polygon } from 'geojson';

  export function geoAirocean(): GeoProjection;
  export function geoImago(): GeoProjection;
  export function geoInterruptedMollweide(): GeoProjection;
  export function geoInterruptedMollweideHemispheres(): GeoProjection;
  export function geoPolyhedralWaterman(): GeoProjection;
  export function geoInterrupt(
    raw: GeoRawProjection,
    lobes: Array<Array<Array<[number, number]>>>
  ): GeoProjection;
  export function geoClipPolygon(
    polygon: Polygon | MultiPolygon
  ): (stream: GeoStream) => GeoStream;
}
