import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  LineString,
  MultiLineString,
  Polygon,
  Position
} from 'geojson';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';
import {
  BASEMAP_LAYER_CONFIG,
  BasemapGraticuleMode
} from '$lib/features/commons/constants/visualization.constants';
import { projectGeoJSON } from '../utils/geoarrow-stream-bridge.utils';
import type { BBox } from '../types';

type GraticuleAxis = 'meridian' | 'parallel';
export type GraticuleLineProperties = {
  name: string;
  axis: GraticuleAxis;
  value: number;
  subProjectionId?: string;
};
export type GraticuleClipExtent = [[number, number], [number, number]];

type CompositeGraticuleSubProjection = {
  id: string;
  projection: ProjectionLike;
  bounds: BBox;
  screenExtent?: [[number, number], [number, number]];
};

export type CompositeGraticuleProjection = ProjectionLike & {
  getSubProjections: () => CompositeGraticuleSubProjection[];
};
type ProjectionWithClipExtent = ProjectionLike & {
  clipExtent(): GraticuleClipExtent | null;
  clipExtent(extent: GraticuleClipExtent | null): ProjectionWithClipExtent;
};

const WORLD_BBOX: BBox = [-180, -90, 180, 90];
const TROPIC_LATITUDE = 23.4366;
const POLAR_CIRCLE_LATITUDE = 66.5634;
const COORDINATE_PRECISION = 1_000_000;
const LINE_SAMPLE_STEP_DEGREES = 1;
const EQUATOR_EPSILON = 0.000001;

const projectedGraticuleGeoJsonCache = new WeakMap<
  FeatureCollection,
  WeakMap<object, FeatureCollection>
>();

let cachedGraticuleKey: string | null = null;
let cachedGraticuleData: FeatureCollection<
  LineString,
  GraticuleLineProperties
> | null = null;
let cachedEquatorKey: string | null = null;
let cachedEquatorData: FeatureCollection<
  LineString,
  GraticuleLineProperties
> | null = null;

function projectFeatureCollectionIfNeeded<
  T extends Geometry,
  P extends GeoJsonProperties = GeoJsonProperties
>(
  geojson: FeatureCollection<T, P>,
  projection: ProjectionLike | undefined
): FeatureCollection<T, P> {
  if (!projection) {
    return geojson;
  }

  const projectionKey = projection as ProjectionLike & object;
  let projectionCache = projectedGraticuleGeoJsonCache.get(geojson);
  const cached = projectionCache?.get(projectionKey) as
    FeatureCollection<T, P> | undefined;
  if (cached) {
    return cached;
  }

  const projected = projectGeoJSON(geojson, projection) as FeatureCollection<
    T,
    P
  > | null;
  const result = projected ?? {
    ...geojson,
    features: []
  };

  if (!projectionCache) {
    projectionCache = new WeakMap<object, FeatureCollection>();
    projectedGraticuleGeoJsonCache.set(geojson, projectionCache);
  }
  projectionCache.set(projectionKey, result);

  return result;
}

function createScreenExtentPolygon(
  screenExtent: [[number, number], [number, number]]
): Feature<Polygon> | null {
  const [[x0, y0], [x1, y1]] = screenExtent;
  if (![x0, y0, x1, y1].every(Number.isFinite) || x0 === x1 || y0 === y1) {
    return null;
  }

  return {
    type: GEOJSON_TYPE.FEATURE,
    properties: {},
    geometry: {
      type: GEOJSON_TYPE.POLYGON,
      coordinates: [
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0]
        ]
      ]
    }
  };
}

export function createProjectedCompositeOceanData(
  projection: ProjectionLike,
  visibleProjectedExtent?: GraticuleClipExtent | null
): FeatureCollection<Polygon> | null {
  if (
    !hasCompositeGraticuleSubProjections(projection) &&
    !visibleProjectedExtent
  ) {
    return null;
  }

  const extents = hasCompositeGraticuleSubProjections(projection)
    ? projection
        .getSubProjections()
        .map((subProjection) => subProjection.screenExtent)
        .filter((extent): extent is GraticuleClipExtent => extent !== undefined)
    : [];
  const compositeExtent =
    extents.length > 0
      ? ([
          [
            Math.min(...extents.map((extent) => extent[0][0])),
            Math.min(...extents.map((extent) => extent[0][1]))
          ],
          [
            Math.max(...extents.map((extent) => extent[1][0])),
            Math.max(...extents.map((extent) => extent[1][1]))
          ]
        ] satisfies GraticuleClipExtent)
      : null;
  const LARGE_EXTENT: GraticuleClipExtent = [
    [-99999, -99999],
    [99999, 99999]
  ];
  const feature = createScreenExtentPolygon(
    visibleProjectedExtent ?? compositeExtent ?? LARGE_EXTENT
  );
  return feature
    ? { type: GEOJSON_TYPE.FEATURE_COLLECTION, features: [feature] }
    : null;
}

export function hasCompositeGraticuleSubProjections(
  projection: ProjectionLike
): projection is CompositeGraticuleProjection {
  return (
    typeof (projection as { getSubProjections?: unknown }).getSubProjections ===
    'function'
  );
}

function hasClipExtent(
  projection: ProjectionLike
): projection is ProjectionWithClipExtent {
  return (
    typeof (projection as { clipExtent?: unknown }).clipExtent === 'function'
  );
}

function projectGraticuleLineToSegments(
  coordinates: Position[],
  projection: ProjectionLike,
  clipExtent?: GraticuleClipExtent | null
): Position[][] {
  const segments: Position[][] = [];
  let currentSegment: Position[] = [];
  const previousClipExtent =
    clipExtent && hasClipExtent(projection) ? projection.clipExtent() : null;

  if (clipExtent && hasClipExtent(projection)) {
    projection.clipExtent(clipExtent);
  }

  const stream = projection.stream({
    point(x: number, y: number): void {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        currentSegment.push([x, y]);
      }
    },
    lineStart(): void {
      currentSegment = [];
    },
    lineEnd(): void {
      if (currentSegment.length >= 2) {
        segments.push(currentSegment);
      }
      currentSegment = [];
    },
    polygonStart(): void {},
    polygonEnd(): void {}
  });

  try {
    stream.lineStart();
    for (const coordinate of coordinates) {
      const [longitude, latitude] = coordinate;
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        stream.point(longitude, latitude);
      }
    }
    stream.lineEnd();
  } finally {
    if (clipExtent && hasClipExtent(projection)) {
      projection.clipExtent(previousClipExtent);
    }
  }

  return segments;
}

function bboxIntersects(first: BBox, second: BBox): boolean {
  return (
    rangesOverlap(first[0], first[2], second[0], second[2]) &&
    rangesOverlap(first[1], first[3], second[1], second[3])
  );
}

function projectGraticuleWithSubProjections(
  geojson: FeatureCollection<LineString, GraticuleLineProperties>,
  entries: CompositeGraticuleSubProjection[],
  routingBbox: BBox,
  clipExtent?: GraticuleClipExtent | null
): FeatureCollection<LineString | MultiLineString, GraticuleLineProperties> {
  const features: Feature<
    LineString | MultiLineString,
    GraticuleLineProperties
  >[] = [];

  for (const feature of geojson.features) {
    for (const entry of entries) {
      if (!bboxIntersects(entry.bounds, routingBbox)) {
        continue;
      }

      const segments = projectGraticuleLineToSegments(
        feature.geometry.coordinates,
        entry.projection,
        clipExtent
      );
      if (segments.length === 0) {
        continue;
      }

      features.push({
        ...feature,
        properties: {
          ...feature.properties,
          subProjectionId: entry.id
        },
        geometry:
          segments.length === 1
            ? {
                type: GEOJSON_TYPE.LINE_STRING,
                coordinates: segments[0]
              }
            : {
                type: GEOJSON_TYPE.MULTI_LINE_STRING,
                coordinates: segments
              }
      });
    }
  }

  return {
    ...geojson,
    features
  };
}

export function projectGraticuleFeatureCollectionIfNeeded(
  geojson: FeatureCollection<LineString, GraticuleLineProperties>,
  ctx: {
    projection?: ProjectionLike;
    graticuleClipExtent?: GraticuleClipExtent | null;
  },
  routingBbox: BBox
): FeatureCollection<LineString | MultiLineString, GraticuleLineProperties> {
  if (!ctx.projection) {
    return geojson;
  }

  if (hasCompositeGraticuleSubProjections(ctx.projection)) {
    const entries = ctx.projection.getSubProjections();
    return entries.length > 0
      ? projectGraticuleWithSubProjections(
          geojson,
          entries,
          routingBbox,
          ctx.graticuleClipExtent
        )
      : projectFeatureCollectionIfNeeded(geojson, ctx.projection);
  }

  return projectFeatureCollectionIfNeeded(geojson, ctx.projection);
}

function roundCoordinate(value: number): number {
  const rounded =
    Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clampCoordinate(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bboxToKey(bbox: BBox): string {
  return bbox.map((value) => roundCoordinate(value)).join(',');
}

export function normalizeLineBbox(bbox: BBox | null | undefined): BBox {
  if (
    !bbox ||
    bbox.length !== 4 ||
    bbox.some((value) => !Number.isFinite(value))
  ) {
    return WORLD_BBOX;
  }

  const west = clampCoordinate(Math.min(bbox[0], bbox[2]), -180, 180);
  const east = clampCoordinate(Math.max(bbox[0], bbox[2]), -180, 180);
  const south = clampCoordinate(Math.min(bbox[1], bbox[3]), -90, 90);
  const north = clampCoordinate(Math.max(bbox[1], bbox[3]), -90, 90);

  if (west >= east || south >= north) {
    return WORLD_BBOX;
  }

  return [
    roundCoordinate(west),
    roundCoordinate(south),
    roundCoordinate(east),
    roundCoordinate(north)
  ];
}

function isEquatorLatitude(latitude: number): boolean {
  return Math.abs(latitude) <= EQUATOR_EPSILON;
}

function isWithin(value: number, min: number, max: number): boolean {
  return value >= min - EQUATOR_EPSILON && value <= max + EQUATOR_EPSILON;
}

function rangesOverlap(
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number
): boolean {
  return (
    firstMin <= secondMax + EQUATOR_EPSILON &&
    secondMin <= firstMax + EQUATOR_EPSILON
  );
}

function createSampledRange(min: number, max: number): number[] {
  const roundedMax = roundCoordinate(max);
  const values: number[] = [roundCoordinate(min)];
  let current = min;

  while (current + LINE_SAMPLE_STEP_DEGREES < max) {
    current += LINE_SAMPLE_STEP_DEGREES;
    values.push(roundCoordinate(current));
  }

  if (values[values.length - 1] !== roundedMax) {
    values.push(roundedMax);
  }

  return values;
}

function createDegreeSeries(
  min: number,
  max: number,
  spacing: number
): number[] {
  const step = normalizeGraticuleSpacing(spacing);
  const first = Math.ceil(min / step) * step;
  const values: number[] = [];

  for (let current = first; current <= max + EQUATOR_EPSILON; current += step) {
    values.push(roundCoordinate(current));
  }

  return values;
}

function normalizeGraticuleSpacing(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return clampCoordinate(
    Math.round(parsed),
    BASEMAP_LAYER_CONFIG.graticuleSpacing.min,
    BASEMAP_LAYER_CONFIG.graticuleSpacing.max
  );
}

function createLineFeature(
  name: string,
  axis: GraticuleAxis,
  value: number,
  coordinates: [number, number][]
): Feature<LineString, GraticuleLineProperties> {
  return {
    type: GEOJSON_TYPE.FEATURE,
    properties: { name, axis, value: roundCoordinate(value) },
    geometry: {
      type: GEOJSON_TYPE.LINE_STRING,
      coordinates
    }
  };
}

function createParallelFeature(
  latitude: number
): Feature<LineString, GraticuleLineProperties> {
  const coordinates = createSampledRange(WORLD_BBOX[0], WORLD_BBOX[2]).map(
    (longitude) => [longitude, roundCoordinate(latitude)] as [number, number]
  );
  return createLineFeature(
    `parallel-${roundCoordinate(latitude)}`,
    'parallel',
    latitude,
    coordinates
  );
}

function createMeridianFeature(
  longitude: number
): Feature<LineString, GraticuleLineProperties> {
  const coordinates = createSampledRange(WORLD_BBOX[1], WORLD_BBOX[3]).map(
    (latitude) => [roundCoordinate(longitude), latitude] as [number, number]
  );
  return createLineFeature(
    `meridian-${roundCoordinate(longitude)}`,
    'meridian',
    longitude,
    coordinates
  );
}

export function getEquatorGeoJSON(): FeatureCollection<
  LineString,
  GraticuleLineProperties
> {
  const key = 'equator:complete-domain';
  if (cachedEquatorKey === key && cachedEquatorData) {
    return cachedEquatorData;
  }

  cachedEquatorData = {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features: [createParallelFeature(0)]
  };
  cachedEquatorKey = key;
  return cachedEquatorData;
}

function createRegularGraticuleGeoJSON(
  bbox: BBox,
  spacingDegrees: number,
  excludeEquator: boolean
): FeatureCollection<LineString, GraticuleLineProperties> {
  const [west, south, east, north] = bbox;
  const features: Feature<LineString, GraticuleLineProperties>[] = [];

  for (const longitude of createDegreeSeries(west, east, spacingDegrees)) {
    features.push(createMeridianFeature(longitude));
  }

  for (const latitude of createDegreeSeries(south, north, spacingDegrees)) {
    if (excludeEquator && isEquatorLatitude(latitude)) {
      continue;
    }
    features.push(createParallelFeature(latitude));
  }

  return {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features
  };
}

function createRemarkableGraticuleGeoJSON(
  bbox: BBox,
  excludeEquator: boolean
): FeatureCollection<LineString, GraticuleLineProperties> {
  const features: Feature<LineString, GraticuleLineProperties>[] = [];
  const [west, south, east, north] = bbox;
  const remarkableParallels = [
    -POLAR_CIRCLE_LATITUDE,
    -TROPIC_LATITUDE,
    0,
    TROPIC_LATITUDE,
    POLAR_CIRCLE_LATITUDE
  ];

  if (isWithin(0, west, east)) {
    features.push(createMeridianFeature(0));
  }

  for (const latitude of remarkableParallels) {
    if (!isWithin(latitude, south, north)) {
      continue;
    }
    if (excludeEquator && isEquatorLatitude(latitude)) {
      continue;
    }
    features.push(createParallelFeature(latitude));
  }

  return {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features
  };
}

export function getGraticuleGeoJSON(
  spacingDegrees: unknown,
  mode: BasemapGraticuleMode | null | undefined,
  excludeEquator: boolean
): FeatureCollection<LineString, GraticuleLineProperties> {
  const resolvedSpacingDegrees = normalizeGraticuleSpacing(spacingDegrees);
  const selectionBbox = WORLD_BBOX;
  const resolvedMode = mode ?? BasemapGraticuleMode.REMARKABLE;
  const graticuleKey = [
    resolvedMode,
    resolvedSpacingDegrees,
    bboxToKey(selectionBbox),
    excludeEquator ? 'exclude-equator' : 'include-equator'
  ].join(':');

  if (cachedGraticuleKey !== graticuleKey || !cachedGraticuleData) {
    cachedGraticuleData =
      resolvedMode === BasemapGraticuleMode.REGULAR
        ? createRegularGraticuleGeoJSON(
            selectionBbox,
            resolvedSpacingDegrees,
            excludeEquator
          )
        : createRemarkableGraticuleGeoJSON(selectionBbox, excludeEquator);
    cachedGraticuleKey = graticuleKey;
  }

  return cachedGraticuleData;
}
