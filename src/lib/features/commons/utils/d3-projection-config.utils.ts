import type { GeoProjection } from 'd3-geo';
import * as d3geo from 'd3-geo';
import * as d3geoProjection from 'd3-geo-projection';
import type { D3Usage } from 'proj-suggest';

type GeoProjectionFactory = () => GeoProjection;
type D3GeoProjectionModule = Record<string, unknown>;

const d3ProjectionFactories = d3geoProjection as D3GeoProjectionModule;

function getD3ProjectionFactory(
  name: string
): GeoProjectionFactory | undefined {
  const candidate = d3ProjectionFactories[name];
  return typeof candidate === 'function'
    ? (candidate as GeoProjectionFactory)
    : undefined;
}

const D3_FACTORY_MAP: Record<string, GeoProjectionFactory | undefined> = {
  geoMercator: d3geo.geoMercator,
  geoEquirectangular: d3geo.geoEquirectangular,
  geoAlbers: d3geo.geoAlbers,
  geoOrthographic: d3geo.geoOrthographic,
  geoStereographic: d3geo.geoStereographic,
  geoEqualEarth: d3geo.geoEqualEarth,
  geoAzimuthalEqualArea: d3geo.geoAzimuthalEqualArea,
  geoAzimuthalEquidistant: d3geo.geoAzimuthalEquidistant,
  geoConicConformal: d3geo.geoConicConformal,
  geoConicEqualArea: d3geo.geoConicEqualArea,
  geoConicEquidistant: d3geo.geoConicEquidistant,
  geoTransverseMercator: d3geo.geoTransverseMercator,
  geoNaturalEarth1: d3geo.geoNaturalEarth1,
  geoGnomonic: d3geo.geoGnomonic,
  geoBonne: getD3ProjectionFactory('geoBonne'),
  geoCassini: getD3ProjectionFactory('geoCassini'),
  geoTimes: getD3ProjectionFactory('geoTimes'),
  geoBertin1953: getD3ProjectionFactory('geoBertin1953'),
  geoArmadillo: getD3ProjectionFactory('geoArmadillo'),
  geoMollweide: getD3ProjectionFactory('geoMollweide'),
  geoInterruptedMollweide: getD3ProjectionFactory('geoInterruptedMollweide'),
  geoInterruptedMollweideHemispheres: getD3ProjectionFactory(
    'geoInterruptedMollweideHemispheres'
  ),
  geoAirocean: getD3ProjectionFactory('geoAirocean'),
  geoImago: getD3ProjectionFactory('geoImago'),
  geoCylindricalEqualArea: getD3ProjectionFactory('geoCylindricalEqualArea'),
  geoRobinson: getD3ProjectionFactory('geoRobinson'),
  geoWinkel3: getD3ProjectionFactory('geoWinkel3')
};

export function buildD3ProjectionFromConfig(
  config: D3Usage
): GeoProjection | null {
  const factory = D3_FACTORY_MAP[config.projection];
  if (!factory) {
    return null;
  }

  const projection = factory();

  if (config.rotate) {
    projection.rotate([
      config.rotate[0],
      config.rotate[1],
      config.rotate[2] ?? 0
    ]);
  }

  if (config.center) {
    projection.center(config.center);
  }

  if (
    config.parallels &&
    'parallels' in projection &&
    typeof (projection as Record<string, unknown>).parallels === 'function'
  ) {
    (
      projection as unknown as { parallels: (p: [number, number]) => void }
    ).parallels(config.parallels);
  }

  return projection;
}
