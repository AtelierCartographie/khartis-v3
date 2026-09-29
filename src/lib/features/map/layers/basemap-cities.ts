import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type {
  BinaryPointData,
  ProjectionLike
} from '@ateliercartographie/geoarrow-deck-stream';
import {
  BASEMAP_LAYER_CONFIG,
  BasemapCityCategory,
  BasemapCitySymbol
} from '$lib/features/commons/constants/visualization.constants';
import type { VillesLayerConfig } from '../stores/basemap-layers.store.svelte';
import { createProjectionPointSampler } from '../utils/projected-bbox.utils';

export interface BasemapCity {
  position: [number, number];
  properties: Record<string, unknown>;
}

export interface BasemapCityShapes {
  length: number;
  positions: Float64Array;
  startIndices: Uint32Array;
}

const CITY_LABEL_COLUMNS = [
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
const CITY_ATTRIBUTE_COLUMNS = [
  'adm0cap',
  'featurecla',
  'pop_max',
  'population',
  'pop',
  'POP_MAX',
  ...CITY_LABEL_COLUMNS
];

let cachedCitiesKey: string | null = null;
let cachedCitiesSource: BasemapCity[] | null = null;
let cachedFilteredCities: BasemapCity[] | null = null;
let cachedLabelledCitiesSource: BasemapCity[] | null = null;
let cachedLabelledCities: BasemapCity[] | null = null;
let cachedPolygonCitiesKey: string | null = null;
let cachedPolygonCities: BasemapCityShapes | null = null;
const projectedCitiesCache = new WeakMap<
  BasemapCity[],
  WeakMap<object, BasemapCity[]>
>();

export function readBasemapCities(
  table: ArrowTable,
  points: BinaryPointData
): BasemapCity[] {
  const columns = CITY_ATTRIBUTE_COLUMNS.flatMap((name) => {
    const vector = table.getChild(name);
    return vector ? [{ name, vector }] : [];
  });
  const size = points.size ?? 2;
  const cities: BasemapCity[] = [];

  for (let index = 0; index < points.length; index++) {
    const x = Number(points.positions[index * size]);
    const y = Number(points.positions[index * size + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const row = points.featureIds[index];
    const properties: Record<string, unknown> = {};
    for (const { name, vector } of columns) {
      const value = vector.get(row);
      properties[name] = typeof value === 'bigint' ? Number(value) : value;
    }
    cities.push({ position: [x, y], properties });
  }

  return cities;
}

export function projectBasemapCities(
  cities: BasemapCity[],
  projection: ProjectionLike | undefined
): BasemapCity[] {
  if (!projection) {
    return cities;
  }

  const projectionKey = projection as ProjectionLike & object;
  let byProjection = projectedCitiesCache.get(cities);
  const cached = byProjection?.get(projectionKey);
  if (cached) {
    return cached;
  }

  const projectPoint = createProjectionPointSampler(projection);
  const projected = cities.flatMap((city) => {
    const position = projectPoint(city.position);
    return position ? [{ ...city, position }] : [];
  });

  if (!byProjection) {
    byProjection = new WeakMap();
    projectedCitiesCache.set(cities, byProjection);
  }
  byProjection.set(projectionKey, projected);
  return projected;
}

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

function convertCitiesToShapes(
  cities: BasemapCity[],
  symbol: BasemapCitySymbol,
  sizePx: number,
  radiusScale?: number
): BasemapCityShapes {
  const sides = getSymbolPolygonSides(symbol);
  const angleOffset = getSymbolAngleOffset(symbol);
  const isStar = isStarSymbol(symbol);
  const verticesPerShape = sides + 1;
  const positions = new Float64Array(cities.length * verticesPerShape * 2);
  const startIndices = new Uint32Array(cities.length + 1);

  cities.forEach((city, cityIndex) => {
    const ring = createSymbolPolygon(
      city.position,
      sizePx,
      sides,
      angleOffset,
      isStar,
      radiusScale
    );
    const offset = cityIndex * verticesPerShape;
    startIndices[cityIndex] = offset;
    ring.forEach(([x, y], vertexIndex) => {
      positions[(offset + vertexIndex) * 2] = x;
      positions[(offset + vertexIndex) * 2 + 1] = y;
    });
  });
  startIndices[cities.length] = cities.length * verticesPerShape;

  return { length: cities.length, positions, startIndices };
}

function filterCitiesByCategory(
  cities: BasemapCity[],
  category: BasemapCityCategory
): BasemapCity[] {
  return cities.filter(({ properties: props }) => {
    const featureClass = props.featurecla;
    const isCapital =
      props.adm0cap === 1 ||
      (typeof featureClass === 'string' && featureClass.includes('capital'));
    const pop = Number(props.pop_max ?? 0);

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

function getCityPopulation(city: BasemapCity): number {
  const props = city.properties;
  const rawValue =
    props.pop_max ?? props.population ?? props.pop ?? props.POP_MAX ?? 0;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

function filterCitiesByCount(
  cities: BasemapCity[],
  count: number
): BasemapCity[] {
  return cities
    .map((city, index) => ({
      city,
      index,
      population: getCityPopulation(city)
    }))
    .sort((left, right) => {
      const populationDelta = right.population - left.population;
      return populationDelta === 0 ? left.index - right.index : populationDelta;
    })
    .slice(0, count)
    .map(({ city }) => city);
}

export function getCitiesFilterKey(config: VillesLayerConfig): string {
  const count = clampBasemapCityCount(config.count);
  return count === undefined ? `category:${config.category}` : `count:${count}`;
}

export function getFilteredCitiesForConfig(
  cities: BasemapCity[],
  config: VillesLayerConfig
): BasemapCity[] {
  const filterKey = getCitiesFilterKey(config);
  const isNewSource = cachedCitiesSource !== cities;

  if (isNewSource || cachedCitiesKey !== filterKey || !cachedFilteredCities) {
    const count = clampBasemapCityCount(config.count);
    cachedFilteredCities =
      count === undefined
        ? filterCitiesByCategory(cities, config.category)
        : filterCitiesByCount(cities, count);
    cachedCitiesKey = filterKey;
    cachedCitiesSource = cities;
    cachedLabelledCitiesSource = null;
    cachedLabelledCities = null;
    cachedPolygonCitiesKey = null;
    cachedPolygonCities = null;
  }

  return cachedFilteredCities;
}

export function getLabelledCitiesForConfig(
  cities: BasemapCity[],
  config: VillesLayerConfig
): BasemapCity[] {
  const filteredCities = getFilteredCitiesForConfig(cities, config);

  if (cachedLabelledCitiesSource !== filteredCities || !cachedLabelledCities) {
    cachedLabelledCities = filteredCities.filter((city) =>
      Boolean(resolveCityLabel(city))
    );
    cachedLabelledCitiesSource = filteredCities;
  }

  return cachedLabelledCities;
}

export function resolveCityLabel(city: BasemapCity): string {
  for (const key of CITY_LABEL_COLUMNS) {
    const value = city.properties[key];
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
  cities: BasemapCity[],
  config: VillesLayerConfig,
  filterKey: string,
  options?: { projected?: boolean }
): BasemapCityShapes {
  if (options?.projected) {
    return convertCitiesToShapes(cities, config.symbol, config.size, 0.5);
  }

  const polygonKey = `${filterKey}:${config.symbol}:${config.size}`;
  if (cachedPolygonCitiesKey !== polygonKey || !cachedPolygonCities) {
    cachedPolygonCities = convertCitiesToShapes(
      cities,
      config.symbol,
      config.size
    );
    cachedPolygonCitiesKey = polygonKey;
  }

  return cachedPolygonCities;
}
