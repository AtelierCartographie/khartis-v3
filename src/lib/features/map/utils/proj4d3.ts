import proj4 from 'proj4';
import { geoProjection, type GeoProjection } from 'd3-geo';

/**
 * Wraps a proj4 definition string into a d3-compatible GeoProjection.
 * Used to convert projection-presets.json entries into projections
 * that geoarrow-deck-stream's buildCompositeProjection can consume.
 */
export function proj4d3(definition: string): GeoProjection {
  const converter = proj4('EPSG:4326', definition);

  const projection = geoProjection((lon: number, lat: number) => {
    const [x, y] = converter.forward([lon, lat]);
    return [x, y] as [number, number];
  });

  projection.invert = ([x, y]: [number, number]) => {
    const [lon, lat] = converter.inverse([x, y]);
    return [lon, lat] as [number, number];
  };

  return projection;
}
