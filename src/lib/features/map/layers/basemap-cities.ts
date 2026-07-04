import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';
import {
  BASEMAP_LAYER_CONFIG,
  BasemapCityCategory,
  BasemapCitySymbol
} from '$lib/features/commons/constants/visualization.constants';
import type { VillesLayerConfig } from '../stores/basemap-layers.store.svelte';

let cachedCitiesKey: string | null = null;
let cachedCitiesSource: FeatureCollection<Point> | null = null;
let cachedFilteredCities: FeatureCollection<Point> | null = null;
let cachedLabelledCitiesSource: FeatureCollection<Point> | null = null;
let cachedLabelledCities: FeatureCollection<Point> | null = null;
let cachedPolygonCitiesKey: string | null = null;
let cachedPolygonCities: FeatureCollection<Polygon> | null = null;

function getSymbolPolygonSides(symbol: BasemapCitySymbol): number {
  switch (symbol) {
    case BasemapCitySymbol.POINT:
      return 32;
    case BasemapCitySymbol.SQUARE:
      return 4;
    case BasemapCitySymbol.DIAMOND:
      return 4;
    case BasemapCitySymbol.STAR:
      return 10;
    default:
      return 32;
  }
}

function getSymbolAngleOffset(symbol: BasemapCitySymbol): number {
  switch (symbol) {
    case BasemapCitySymbol.SQUARE:
      return 45;
    case BasemapCitySymbol.DIAMOND:
      return 0;
    default:
      return 0;
  }
}

function isStarSymbol(symbol: BasemapCitySymbol): boolean {
  return symbol === BasemapCitySymbol.STAR;
}

function createSymbolPolygon(
  center: [number, number],
  sizePx: number,
  sides: number,
  angleOffset: number,
  isStar: boolean,
  radiusScale = 0.00001
): number[][] {
  const [cx, cy] = center;
  const radius = sizePx * radiusScale;
  const points: number[][] = [];
  const startAngle = (angleOffset * Math.PI) / 180;

  if (isStar) {
    const outerRadius = radius;
    const innerRadius = radius * 0.4;
    for (let i = 0; i < sides; i++) {
      const angle = startAngle + (i * 2 * Math.PI) / sides;
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
  } else {
    for (let i = 0; i < sides; i++) {
      const angle = startAngle + (i * 2 * Math.PI) / sides;
      points.push([
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle)
      ]);
    }
  }

  points.push(points[0]);
  return points;
}

function convertCitiesToPolygons(
  cities: FeatureCollection<Point>,
  symbol: BasemapCitySymbol,
  sizePx: number,
  radiusScale?: number
): FeatureCollection<Polygon> {
  const sides = getSymbolPolygonSides(symbol);
  const angleOffset = getSymbolAngleOffset(symbol);
  const isStar = isStarSymbol(symbol);

  const features = cities.features.map((feature) => {
    const coords = feature.geometry.coordinates as [number, number];
    const polygon = createSymbolPolygon(
      coords,
      sizePx,
      sides,
      angleOffset,
      isStar,
      radiusScale
    );
    return {
      type: GEOJSON_TYPE.FEATURE,
      properties: feature.properties,
      geometry: {
        type: GEOJSON_TYPE.POLYGON,
        coordinates: [polygon]
      }
    };
  });

  return { type: GEOJSON_TYPE.FEATURE_COLLECTION, features };
}

function filterCitiesByCategory(
  cities: FeatureCollection<Point>,
  category: BasemapCityCategory
): FeatureCollection<Point> {
  const features = cities.features.filter((feature) => {
    const props = feature.properties ?? {};
    const isCapital =
      props.adm0cap === 1 || props.featurecla?.includes('capital');
    const pop = props.pop_max ?? 0;

    switch (category) {
      case BasemapCityCategory.CAPITALS:
        return isCapital;
      case BasemapCityCategory.POP_100K:
        return pop >= 100000;
      case BasemapCityCategory.POP_250K:
        return pop >= 250000;
      case BasemapCityCategory.POP_500K:
        return pop >= 500000;
      default:
        return isCapital;
    }
  });

  return { type: GEOJSON_TYPE.FEATURE_COLLECTION, features };
}

function clampBasemapCityCount(count: number | undefined): number | undefined {
  if (count === undefined || !Number.isFinite(count)) {
    return undefined;
  }

  return Math.max(
    BASEMAP_LAYER_CONFIG.cityCount.min,
    Math.min(BASEMAP_LAYER_CONFIG.cityCount.max, Math.round(count))
  );
}

function getCityPopulation(feature: Feature<Point>): number {
  const props = feature.properties ?? {};
  const rawValue =
    props.pop_max ?? props.population ?? props.pop ?? props.POP_MAX ?? 0;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

function filterCitiesByCount(
  cities: FeatureCollection<Point>,
  count: number
): FeatureCollection<Point> {
  const features = cities.features
    .map((feature, index) => ({
      feature,
      index,
      population: getCityPopulation(feature)
    }))
    .sort((left, right) => {
      const populationDelta = right.population - left.population;
      return populationDelta === 0 ? left.index - right.index : populationDelta;
    })
    .slice(0, count)
    .map(({ feature }) => feature);

  return { type: GEOJSON_TYPE.FEATURE_COLLECTION, features };
}

export function getCitiesFilterKey(config: VillesLayerConfig): string {
  const count = clampBasemapCityCount(config.count);
  return count === undefined ? `category:${config.category}` : `count:${count}`;
}

export function getFilteredCitiesForConfig(
  citiesData: FeatureCollection<Point>,
  config: VillesLayerConfig
): FeatureCollection<Point> {
  const filterKey = getCitiesFilterKey(config);
  const isNewSource = cachedCitiesSource !== citiesData;

  if (isNewSource || cachedCitiesKey !== filterKey || !cachedFilteredCities) {
    const count = clampBasemapCityCount(config.count);
    cachedFilteredCities =
      count === undefined
        ? filterCitiesByCategory(citiesData, config.category)
        : filterCitiesByCount(citiesData, count);
    cachedCitiesKey = filterKey;
    cachedCitiesSource = citiesData;
    cachedLabelledCitiesSource = null;
    cachedLabelledCities = null;
    cachedPolygonCitiesKey = null;
    cachedPolygonCities = null;
  }

  return cachedFilteredCities;
}

export function getLabelledCitiesForConfig(
  citiesData: FeatureCollection<Point>,
  config: VillesLayerConfig
): FeatureCollection<Point> {
  const filteredCities = getFilteredCitiesForConfig(citiesData, config);

  if (cachedLabelledCitiesSource !== filteredCities || !cachedLabelledCities) {
    cachedLabelledCities = {
      type: GEOJSON_TYPE.FEATURE_COLLECTION,
      features: filteredCities.features.filter((feature) =>
        Boolean(resolveCityLabel(feature))
      )
    };
    cachedLabelledCitiesSource = filteredCities;
  }

  return cachedLabelledCities;
}

export function resolveCityLabel(feature: Feature<Point>): string {
  const props = feature.properties ?? {};
  const keys = [
    'label',
    'name',
    'name_fr',
    'name_en',
    'nameascii',
    'NAME',
    'NOM',
    'nom',
    'id'
  ];

  for (const key of keys) {
    const value = props[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return '';
}

export function getPolygonCitiesForConfig(
  cities: FeatureCollection<Point>,
  config: VillesLayerConfig,
  filterKey: string,
  options?: { projected?: boolean }
): FeatureCollection<Polygon> {
  if (options?.projected) {
    return convertCitiesToPolygons(cities, config.symbol, config.size, 0.5);
  }

  const polygonKey = `${filterKey}:${config.symbol}:${config.size}`;
  if (cachedPolygonCitiesKey !== polygonKey || !cachedPolygonCities) {
    cachedPolygonCities = convertCitiesToPolygons(
      cities,
      config.symbol,
      config.size
    );
    cachedPolygonCitiesKey = polygonKey;
  }

  return cachedPolygonCities;
}
