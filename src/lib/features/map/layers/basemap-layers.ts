import { COORDINATE_SYSTEM, type Layer } from '@deck.gl/core';
import type { Matrix4 } from '@math.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import { SolidPolygonLayer, PathLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  createPathLayerProps,
  parseSphere,
  type BinaryPolygonData
} from 'geoarrow-deck-stream';
import {
  parsePaths,
  parseSolidPolygons,
  parsePathsWithProjection,
  parseSolidPolygonsWithProjection,
  pathColorAttr,
  pathWidthAttr,
  projectGeoJSON as _projectGeoJSON
} from '../utils/geoarrow-stream-bridge.utils';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import type {
  FeatureCollection,
  Feature,
  LineString,
  MultiLineString,
  Point,
  MultiPoint,
  Polygon,
  MultiPolygon
} from 'geojson';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  ArrowExtension,
  createLayerId,
  DeckLayerId,
  BASEMAP_DATASET_ID,
  DEFAULT_PROJECTION_SUFFIX
} from '../constants';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';
import { arrowTableToGeoJSON, extractGeometryInfo } from '../io';
import {
  basemapLayersStore,
  BASEMAP_LAYER_ID,
  getBasemapRenderGroup,
  type TerreLayerConfig,
  type MersLayerConfig,
  type ReliefLayerConfig,
  type FrontieresLayerConfig,
  type EquateurLayerConfig,
  type MeridiensLayerConfig,
  type LacsLayerConfig,
  type RivieresLayerConfig,
  type VillesLayerConfig
} from '../stores/basemap-layers.store.svelte';
import {
  BASEMAP_LAYER_CONFIG,
  BasemapGraticuleMode,
  BasemapRepresentation,
  BasemapCityCategory,
  BasemapCitySymbol
} from '$lib/features/commons/constants/visualization.constants';
import {
  CARTOGRAPHIC_FONT_FAMILY,
  resolveFontFamilyStack
} from '$lib/features/step-toolbar/fonts.constants';
import type { BBox, DeckDataRow, GeometryInfo, RGBColor } from '../types';
import type { StylePresets } from '../types/basemap.types';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { withOpacity, dottedPatternToDashArray } from './layer-helpers';
import { createCompatibleSolidPolygonLayerProps } from '../utils/solid-polygon-layer-props.utils';
import {
  DEFAULT_TEXT_FONT_SETTINGS_RASTER,
  DEFAULT_TEXT_LINE_HEIGHT,
  DECK_TEXT_CHARACTER_SET
} from './text-character-set';

const DASH_EXTENSION = new PathStyleExtension({
  dash: true,
  highPrecisionDash: true
});
const SOLID_DASH_ARRAY: [number, number] = [1, 0];
const basemapGeoJsonCache = new WeakMap<
  ArrowTable,
  Map<string, FeatureCollection | null>
>();
const projectedBasemapGeoJsonCache = new WeakMap<
  FeatureCollection,
  WeakMap<object, FeatureCollection>
>();

type GraticuleAxis = 'meridian' | 'parallel';
type GraticuleLineProperties = {
  name: string;
  axis: GraticuleAxis;
  value: number;
  subProjectionId?: string;
};
type GraticuleClipExtent = [[number, number], [number, number]];

type CompositeGraticuleSubProjection = {
  id: string;
  projection: ProjectionLike;
  bounds: BBox;
  screenExtent?: [[number, number], [number, number]];
};

type CompositeGraticuleProjection = ProjectionLike & {
  getSubProjections: () => CompositeGraticuleSubProjection[];
};
type ProjectionWithClipExtent = ProjectionLike & {
  clipExtent(): GraticuleClipExtent | null;
  clipExtent(extent: GraticuleClipExtent | null): ProjectionWithClipExtent;
};

function getCachedBasemapGeoJSON(
  table: ArrowTable,
  geoColumn: string
): FeatureCollection | null {
  let columnMap = basemapGeoJsonCache.get(table);
  if (columnMap) {
    const cached = columnMap.get(geoColumn);
    if (cached !== undefined) return cached;
  } else {
    columnMap = new Map();
    basemapGeoJsonCache.set(table, columnMap);
  }
  const result = arrowTableToGeoJSON(table, geoColumn);
  columnMap.set(geoColumn, result);
  return result;
}

function projectFeatureCollectionIfNeeded<
  T extends GeoJSON.Geometry,
  P extends GeoJSON.GeoJsonProperties = GeoJSON.GeoJsonProperties
>(
  geojson: FeatureCollection<T, P>,
  ctx: Pick<BasemapLayerContext, 'projection'>
): FeatureCollection<T, P> {
  if (!ctx.projection) {
    return geojson;
  }

  const projectionKey = ctx.projection as ProjectionLike & object;
  let projectionCache = projectedBasemapGeoJsonCache.get(geojson);
  const cached = projectionCache?.get(projectionKey) as
    | FeatureCollection<T, P>
    | undefined;
  if (cached) {
    return cached;
  }

  const projected = _projectGeoJSON(
    geojson,
    ctx.projection
  ) as FeatureCollection<T, P> | null;
  const result = projected ?? {
    ...geojson,
    features: []
  };

  if (!projectionCache) {
    projectionCache = new WeakMap<object, FeatureCollection>();
    projectedBasemapGeoJsonCache.set(geojson, projectionCache);
  }
  projectionCache.set(projectionKey, result);

  return result;
}

function hasSpherePolygon(sphereData: BinaryPolygonData): boolean {
  return sphereData.length > 0 && sphereData.positions.length > 0;
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

function createProjectedCompositeOceanData(
  projection: ProjectionLike,
  bbox?: BBox | null,
  visibleProjectedExtent?: GraticuleClipExtent | null
): FeatureCollection<Polygon> | null {
  if (visibleProjectedExtent) {
    const canvasFeature = createScreenExtentPolygon(visibleProjectedExtent);
    if (canvasFeature) {
      return {
        type: GEOJSON_TYPE.FEATURE_COLLECTION,
        features: [canvasFeature]
      };
    }
  }

  if (!hasCompositeGraticuleSubProjections(projection)) {
    return null;
  }

  const features = projection
    .getSubProjections()
    .filter((entry) => !bbox || bboxIntersects(entry.bounds, bbox))
    .map((entry) =>
      entry.screenExtent ? createScreenExtentPolygon(entry.screenExtent) : null
    )
    .filter((feature): feature is Feature<Polygon> => feature !== null);

  return features.length > 0
    ? {
        type: GEOJSON_TYPE.FEATURE_COLLECTION,
        features
      }
    : null;
}

function hasCompositeGraticuleSubProjections(
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
  coordinates: GeoJSON.Position[],
  projection: ProjectionLike,
  clipExtent?: GraticuleClipExtent | null
): GeoJSON.Position[][] {
  const segments: GeoJSON.Position[][] = [];
  let currentSegment: GeoJSON.Position[] = [];
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

function projectGraticuleFeatureCollectionIfNeeded(
  geojson: FeatureCollection<LineString, GraticuleLineProperties>,
  ctx: Pick<BasemapLayerContext, 'projection' | 'graticuleClipExtent'>,
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
      : projectFeatureCollectionIfNeeded(geojson, ctx);
  }

  const projectionKey = ctx.projection as ProjectionLike & object;
  let projectionCache = projectedBasemapGeoJsonCache.get(geojson);
  const cached = projectionCache?.get(projectionKey) as
    | FeatureCollection<LineString | MultiLineString, GraticuleLineProperties>
    | undefined;
  if (cached) {
    return cached;
  }

  const result: FeatureCollection<
    LineString | MultiLineString,
    GraticuleLineProperties
  > = projectFeatureCollectionIfNeeded(geojson, ctx);

  if (!projectionCache) {
    projectionCache = new WeakMap<object, FeatureCollection>();
    projectedBasemapGeoJsonCache.set(geojson, projectionCache);
  }
  projectionCache.set(projectionKey, result);

  return result;
}

function getPreparedBasemapGeoJSON<T extends GeoJSON.Geometry>(
  table: ArrowTable,
  geoColumn: string,
  ctx: Pick<BasemapLayerContext, 'projection'>
): FeatureCollection<T> | null {
  const geojson = getCachedBasemapGeoJSON(
    table,
    geoColumn
  ) as FeatureCollection<T> | null;
  return geojson ? projectFeatureCollectionIfNeeded(geojson, ctx) : null;
}

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

let cachedCitiesKey: string | null = null;
let cachedCitiesSource: FeatureCollection<Point> | null = null;
let cachedFilteredCities: FeatureCollection<Point> | null = null;
let cachedPolygonCitiesKey: string | null = null;
let cachedPolygonCities: FeatureCollection<Polygon> | null = null;

interface BasemapLayerContext {
  modelMatrix?: Matrix4 | null;
  projectionSuffix?: string;
  projection?: ProjectionLike;
  bbox?: BBox | null;
  excludeEquator?: boolean;
  graticuleClipExtent?: GraticuleClipExtent | null;
}

interface BaseLayerProps {
  pickable: false;
  autoHighlight: false;
  modelMatrix: Matrix4 | undefined;
}

function getBaseLayerProps(ctx: BasemapLayerContext): BaseLayerProps {
  return {
    pickable: false,
    autoHighlight: false,
    modelMatrix: ctx.modelMatrix ?? undefined
  };
}

function buildLayerId(
  layerType: DeckLayerId,
  projectionSuffix: string | undefined
): string {
  return createLayerId(
    layerType,
    BASEMAP_DATASET_ID,
    projectionSuffix || DEFAULT_PROJECTION_SUFFIX
  );
}

function isGeoArrowPolygonEncoding(geometryInfo: GeometryInfo): boolean {
  return Boolean(
    geometryInfo.encoding &&
    (geometryInfo.encoding === ArrowExtension.GEOARROW_POLYGON ||
      geometryInfo.encoding === ArrowExtension.GEOARROW_MULTIPOLYGON)
  );
}

function isGeoArrowLineEncoding(geometryInfo: GeometryInfo): boolean {
  return Boolean(
    geometryInfo.encoding &&
    (geometryInfo.encoding === ArrowExtension.GEOARROW_LINESTRING ||
      geometryInfo.encoding === ArrowExtension.GEOARROW_MULTILINESTRING)
  );
}

function isLineGeometry(geometryInfo: GeometryInfo): boolean {
  return geometryInfo.type.includes('LINE');
}

function canRenderViaGeoJsonFallback(geometryInfo: GeometryInfo): boolean {
  return (
    geometryInfo.isNativeGeoArrow ||
    geometryInfo.isWkbEncoded ||
    geometryInfo.isGeoJsonEncoded
  );
}

function shouldPreferProjectedGeoJsonFallback(
  _geometryInfo: GeometryInfo,
  _projection: ProjectionLike | undefined
): boolean {
  return false;
}

function toRgbColor(hex: string): RGBColor {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b];
}

function clampBasemapLayerThickness(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  return Math.min(
    BASEMAP_LAYER_CONFIG.thickness.max,
    Math.max(BASEMAP_LAYER_CONFIG.thickness.min, value)
  );
}

function createStyledBasemapPathLayerProps(
  lineData: ReturnType<typeof parsePaths>,
  color: [number, number, number, number],
  width: number
): ReturnType<typeof createPathLayerProps> {
  const pathProps = createPathLayerProps(lineData);
  const pathBinaryData = pathProps.data as typeof pathProps.data & {
    attributes?: Record<string, unknown>;
  };
  const attributes: Record<string, unknown> = {
    ...(pathBinaryData.attributes ?? {}),
    getColor: pathColorAttr(lineData, () => color),
    getWidth: pathWidthAttr(lineData, () => width)
  };

  return {
    ...pathProps,
    data: {
      ...pathBinaryData,
      attributes
    } as typeof pathProps.data
  };
}

function createDashedGeoJsonLineSubLayerProps(
  dotted: boolean,
  dashArray: [number, number]
) {
  const dashProps = {
    extensions: dotted ? [DASH_EXTENSION] : [],
    getDashArray: dashArray,
    dashJustified: true
  };

  return {
    'polygons-stroke': dashProps,
    linestrings: dashProps
  };
}

export function createTerreLayers(
  worldBaseTable: ArrowTable,
  config: TerreLayerConfig,
  ctx: BasemapLayerContext,
  options?: {
    suppressStroke?: boolean;
  }
): Layer<DeckDataRow>[] {
  if (!config.visible) return [];

  const geometryInfo = extractGeometryInfo(worldBaseTable);
  if (!geometryInfo) {
    logger.warn(
      'World base table missing geo metadata for terre layer',
      LogCategory.MAP
    );
    return [];
  }

  const fillColor = toRgbColor(config.fillColor);
  const strokeColor = toRgbColor(config.strokeColor);
  const fillOpacity = config.fillOpacity / 100;
  const strokeOpacity = config.strokeOpacity / 100;

  const effectiveStrokeThickness = Math.min(config.strokeThickness, 0.5);
  const effectiveStrokeOpacity = Math.min(strokeOpacity, 0.4);
  const shouldRenderStroke =
    effectiveStrokeThickness > 0 && !options?.suppressStroke;

  const layerId = buildLayerId(DeckLayerId.BASEMAP_TERRE, ctx.projectionSuffix);
  const baseProps = getBaseLayerProps(ctx);

  const dashArray = config.strokeDotted
    ? dottedPatternToDashArray(config.strokeDottedPattern)
    : [0, 0];

  const updateTriggers = {
    getFillColor: [config.fillColor, config.fillOpacity],
    getLineColor: [config.strokeColor, effectiveStrokeOpacity],
    getDashArray: [config.strokeDotted, config.strokeDottedPattern]
  };

  const layers: Layer<DeckDataRow>[] = [];
  const preferProjectedGeoJsonFallback = shouldPreferProjectedGeoJsonFallback(
    geometryInfo,
    ctx.projection
  );

  if (
    !preferProjectedGeoJsonFallback &&
    (isGeoArrowPolygonEncoding(geometryInfo) || geometryInfo.isNativeGeoArrow)
  ) {
    const polyData = ctx.projection
      ? parseSolidPolygonsWithProjection(worldBaseTable, ctx.projection)
      : parseSolidPolygons(worldBaseTable);
    const outlineData =
      config.fillShadow || shouldRenderStroke
        ? ctx.projection
          ? parsePathsWithProjection(worldBaseTable, ctx.projection)
          : parsePaths(worldBaseTable)
        : null;

    if (config.fillShadow && outlineData) {
      layers.push(
        new PathLayer({
          id: `${layerId}-shadow`,
          ...createPathLayerProps(outlineData),
          getColor: withOpacity([80, 80, 80], 0.15),
          widthUnits: 'pixels',
          getWidth: 1,
          widthMinPixels: 1,
          widthMaxPixels: 4,
          ...baseProps,
          updateTriggers: {
            getWidth: [config.strokeThickness]
          }
        })
      );
    }

    layers.push(
      new SolidPolygonLayer({
        id: layerId,
        ...createCompatibleSolidPolygonLayerProps(polyData),
        getFillColor: withOpacity(fillColor, fillOpacity),
        ...baseProps,
        updateTriggers: {
          getFillColor: [config.fillColor, config.fillOpacity]
        }
      })
    );

    if (shouldRenderStroke && outlineData) {
      layers.push(
        new PathLayer({
          id: `${layerId}-stroke`,
          ...createPathLayerProps(outlineData),
          getColor: withOpacity(strokeColor, effectiveStrokeOpacity),
          widthUnits: 'pixels',
          getWidth: effectiveStrokeThickness,
          widthMinPixels: 0,
          widthMaxPixels: 0.5,
          extensions: config.strokeDotted ? [DASH_EXTENSION] : [],
          getDashArray: dashArray,
          ...baseProps,
          updateTriggers: {
            getColor: [config.strokeColor, effectiveStrokeOpacity],
            getWidth: [effectiveStrokeThickness],
            getDashArray: [config.strokeDotted, config.strokeDottedPattern]
          }
        })
      );
    }

    return layers;
  }

  if (canRenderViaGeoJsonFallback(geometryInfo)) {
    const geojson = getPreparedBasemapGeoJSON(
      worldBaseTable,
      geometryInfo.geoColumn,
      ctx
    );
    if (geojson) {
      if (config.fillShadow) {
        layers.push(
          new GeoJsonLayer({
            id: `${layerId}-shadow`,
            data: geojson,
            filled: false,
            stroked: true,
            getLineColor: withOpacity([80, 80, 80], 0.15),
            lineWidthUnits: 'pixels',
            getLineWidth: 1,
            lineWidthMinPixels: 1,
            lineWidthMaxPixels: 4,
            ...baseProps,
            updateTriggers: {
              getLineWidth: [config.strokeThickness]
            }
          })
        );
      }

      layers.push(
        new GeoJsonLayer({
          id: layerId,
          data: geojson,
          filled: true,
          stroked: shouldRenderStroke,
          getFillColor: withOpacity(fillColor, fillOpacity),
          getLineColor: shouldRenderStroke
            ? withOpacity(strokeColor, effectiveStrokeOpacity)
            : [0, 0, 0, 0],
          lineWidthUnits: 'pixels',
          getLineWidth: shouldRenderStroke ? effectiveStrokeThickness : 0,
          lineWidthMinPixels: 0,
          lineWidthMaxPixels: 0.5,
          extensions:
            shouldRenderStroke && config.strokeDotted ? [DASH_EXTENSION] : [],
          getDashArray: shouldRenderStroke ? dashArray : [0, 0],
          ...baseProps,
          updateTriggers: {
            ...updateTriggers,
            getLineWidth: [effectiveStrokeThickness]
          }
        })
      );

      return layers;
    }
    logger.warn(
      'Failed to convert world base table to GeoJSON for terre layer',
      LogCategory.MAP
    );
  }

  return [];
}

export function createMersLayer(
  config: MersLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const fillColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const layerId = buildLayerId(DeckLayerId.BASEMAP_MERS, ctx.projectionSuffix);

  if (ctx.projection) {
    const sphereData = parseSphere(ctx.projection, {
      output: 'polygon'
    }) as BinaryPolygonData;

    if (hasSpherePolygon(sphereData)) {
      return new SolidPolygonLayer({
        id: layerId,
        ...createCompatibleSolidPolygonLayerProps(sphereData),
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getFillColor: withOpacity(fillColor, opacity),
        ...getBaseLayerProps(ctx),
        updateTriggers: {
          getFillColor: [config.color, config.opacity]
        }
      });
    }

    const projectedCompositeOceanData = createProjectedCompositeOceanData(
      ctx.projection,
      ctx.bbox,
      ctx.graticuleClipExtent
    );

    if (projectedCompositeOceanData) {
      return new GeoJsonLayer({
        id: layerId,
        data: projectedCompositeOceanData,
        filled: true,
        stroked: false,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getFillColor: withOpacity(fillColor, opacity),
        ...getBaseLayerProps(ctx),
        updateTriggers: {
          getFillColor: [config.color, config.opacity]
        }
      });
    }

    return null;
  }

  const oceanGeoJSON: FeatureCollection = {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features: [
      {
        type: GEOJSON_TYPE.FEATURE,
        properties: {},
        geometry: {
          type: GEOJSON_TYPE.POLYGON,
          coordinates: [
            [
              [-180, -90],
              [180, -90],
              [180, 90],
              [-180, 90],
              [-180, -90]
            ]
          ]
        }
      }
    ]
  };

  return new GeoJsonLayer({
    id: layerId,
    data: oceanGeoJSON,
    filled: true,
    stroked: false,
    getFillColor: withOpacity(fillColor, opacity),
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getFillColor: [config.color, config.opacity]
    }
  });
}

export function createFrontieresLayer(
  frontieresTable: ArrowTable,
  config: FrontieresLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const geometryInfo = extractGeometryInfo(frontieresTable);
  if (!geometryInfo) return null;

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const effectiveThickness = clampBasemapLayerThickness(config.thickness);
  const effectiveOpacity = opacity;

  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_FRONTIERES,
    ctx.projectionSuffix
  );
  const baseProps = getBaseLayerProps(ctx);

  const dashArray: [number, number] = config.dotted
    ? dottedPatternToDashArray(config.dottedPattern)
    : [0, 0];

  const updateTriggers = {
    getLineColor: [config.color, effectiveOpacity],
    getDashArray: [config.dotted, config.dottedPattern]
  };
  const preferProjectedGeoJsonFallback = shouldPreferProjectedGeoJsonFallback(
    geometryInfo,
    ctx.projection
  );

  if (
    !preferProjectedGeoJsonFallback &&
    isLineGeometry(geometryInfo) &&
    (isGeoArrowLineEncoding(geometryInfo) || geometryInfo.isNativeGeoArrow)
  ) {
    const lineData = ctx.projection
      ? parsePathsWithProjection(frontieresTable, ctx.projection)
      : parsePaths(frontieresTable);
    return new PathLayer({
      id: layerId,
      ...createStyledBasemapPathLayerProps(
        lineData,
        withOpacity(strokeColor, effectiveOpacity) as [
          number,
          number,
          number,
          number
        ],
        effectiveThickness
      ),
      widthUnits: 'pixels',
      widthMinPixels: 0,
      widthMaxPixels: BASEMAP_LAYER_CONFIG.thickness.max,
      extensions: config.dotted ? [DASH_EXTENSION] : [],
      getDashArray: dashArray,
      ...baseProps,
      updateTriggers: {
        ...updateTriggers,
        getWidth: [effectiveThickness]
      }
    });
  }

  if (
    isLineGeometry(geometryInfo) &&
    canRenderViaGeoJsonFallback(geometryInfo)
  ) {
    const geojson = getPreparedBasemapGeoJSON(
      frontieresTable,
      geometryInfo.geoColumn,
      ctx
    );
    if (geojson) {
      return new GeoJsonLayer({
        id: layerId,
        data: geojson,
        filled: false,
        stroked: true,
        getLineColor: withOpacity(strokeColor, effectiveOpacity),
        lineWidthUnits: 'pixels',
        getLineWidth: effectiveThickness,
        lineWidthMinPixels: 0,
        lineWidthMaxPixels: BASEMAP_LAYER_CONFIG.thickness.max,
        extensions: config.dotted ? [DASH_EXTENSION] : [],
        getDashArray: dashArray,
        _subLayerProps: createDashedGeoJsonLineSubLayerProps(
          config.dotted,
          dashArray
        ),
        ...baseProps,
        updateTriggers: {
          ...updateTriggers,
          getLineWidth: [effectiveThickness]
        }
      });
    }
  }

  if (
    !preferProjectedGeoJsonFallback &&
    (isGeoArrowPolygonEncoding(geometryInfo) || geometryInfo.isNativeGeoArrow)
  ) {
    const outlineData = ctx.projection
      ? parsePathsWithProjection(frontieresTable, ctx.projection)
      : parsePaths(frontieresTable);
    return new PathLayer({
      id: layerId,
      ...createStyledBasemapPathLayerProps(
        outlineData,
        withOpacity(strokeColor, effectiveOpacity) as [
          number,
          number,
          number,
          number
        ],
        effectiveThickness
      ),
      widthUnits: 'pixels',
      widthMinPixels: 0,
      widthMaxPixels: BASEMAP_LAYER_CONFIG.thickness.max,
      extensions: config.dotted ? [DASH_EXTENSION] : [],
      getDashArray: dashArray,
      ...baseProps,
      updateTriggers: {
        ...updateTriggers,
        getWidth: [effectiveThickness]
      }
    });
  }

  if (canRenderViaGeoJsonFallback(geometryInfo)) {
    const geojson = getPreparedBasemapGeoJSON(
      frontieresTable,
      geometryInfo.geoColumn,
      ctx
    );
    if (geojson) {
      return new GeoJsonLayer({
        id: layerId,
        data: geojson,
        filled: false,
        stroked: true,
        getLineColor: withOpacity(strokeColor, effectiveOpacity),
        lineWidthUnits: 'pixels',
        getLineWidth: effectiveThickness,
        lineWidthMinPixels: 0,
        lineWidthMaxPixels: BASEMAP_LAYER_CONFIG.thickness.max,
        extensions: config.dotted ? [DASH_EXTENSION] : [],
        getDashArray: dashArray,
        _subLayerProps: createDashedGeoJsonLineSubLayerProps(
          config.dotted,
          dashArray
        ),
        ...baseProps,
        updateTriggers: {
          ...updateTriggers,
          getLineWidth: [effectiveThickness]
        }
      });
    }
    logger.warn(
      'Failed to convert frontieres table to GeoJSON for frontieres layer',
      LogCategory.MAP
    );
  }

  return null;
}

const WORLD_BBOX: BBox = [-180, -90, 180, 90];
const TROPIC_LATITUDE = 23.4366;
const POLAR_CIRCLE_LATITUDE = 66.5634;
const COORDINATE_PRECISION = 1_000_000;
const LINE_SAMPLE_STEP_DEGREES = 1;
const EQUATOR_EPSILON = 0.000001;

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

function normalizeLineBbox(bbox: BBox | null | undefined): BBox {
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

function createEquatorGeoJSON(): FeatureCollection<
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

export function createEquateurLayer(
  config: EquateurLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_EQUATEUR,
    ctx.projectionSuffix
  );
  const bbox = normalizeLineBbox(ctx.bbox);
  const equatorKey = 'equator:complete-domain';
  const equatorGeoJSON = createEquatorGeoJSON();

  const dashArray = config.dotted
    ? dottedPatternToDashArray(config.dottedPattern)
    : SOLID_DASH_ARRAY;

  return new GeoJsonLayer({
    id: layerId,
    data: projectGraticuleFeatureCollectionIfNeeded(equatorGeoJSON, ctx, bbox),
    stroked: true,
    filled: false,
    getLineColor: withOpacity(strokeColor, opacity),
    getLineWidth: config.thickness,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1,
    extensions: [DASH_EXTENSION],
    getDashArray: dashArray,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getLineColor: [config.color, config.opacity],
      getLineWidth: [config.thickness],
      getDashArray: [config.dotted, config.dottedPattern],
      data: [equatorKey]
    }
  });
}

export function createMeridiensLayer(
  config: MeridiensLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_MERIDIENS,
    ctx.projectionSuffix
  );
  const routingBbox = normalizeLineBbox(ctx.bbox);
  const spacingDegrees = normalizeGraticuleSpacing(config.spacingDegrees);
  const selectionBbox = WORLD_BBOX;
  const mode = config.mode ?? BasemapGraticuleMode.REMARKABLE;
  const excludeEquator = Boolean(ctx.excludeEquator);

  const graticuleKey = [
    mode,
    spacingDegrees,
    bboxToKey(selectionBbox),
    excludeEquator ? 'exclude-equator' : 'include-equator'
  ].join(':');
  if (cachedGraticuleKey !== graticuleKey || !cachedGraticuleData) {
    cachedGraticuleData =
      mode === BasemapGraticuleMode.REGULAR
        ? createRegularGraticuleGeoJSON(
            selectionBbox,
            spacingDegrees,
            excludeEquator
          )
        : createRemarkableGraticuleGeoJSON(selectionBbox, excludeEquator);
    cachedGraticuleKey = graticuleKey;
  }

  const featuresCollection = cachedGraticuleData;

  const dashArray = config.dotted
    ? dottedPatternToDashArray(config.dottedPattern)
    : SOLID_DASH_ARRAY;

  return new GeoJsonLayer({
    id: layerId,
    data: projectGraticuleFeatureCollectionIfNeeded(
      featuresCollection,
      ctx,
      routingBbox
    ),
    stroked: true,
    filled: false,
    getLineColor: withOpacity(strokeColor, opacity),
    getLineWidth: config.thickness,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 0.5,
    extensions: [DASH_EXTENSION],
    getDashArray: dashArray,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getLineColor: [config.color, config.opacity],
      getLineWidth: [config.thickness],
      getDashArray: [config.dotted, config.dottedPattern],
      data: [graticuleKey]
    }
  });
}

export function createLacsLayer(
  lakesData: FeatureCollection<Polygon | MultiPolygon>,
  config: LacsLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const layerId = buildLayerId(DeckLayerId.BASEMAP_LACS, ctx.projectionSuffix);

  return new GeoJsonLayer({
    id: layerId,
    data: projectFeatureCollectionIfNeeded(lakesData, ctx),
    filled: true,
    stroked: config.thickness > 0,
    getFillColor: withOpacity(strokeColor, opacity * 0.5),
    getLineColor: withOpacity(strokeColor, opacity),
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: config.thickness,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getFillColor: [config.color, config.opacity],
      getLineColor: [config.color, config.opacity],
      lineWidthMinPixels: [config.thickness]
    }
  });
}

export function createRivieresLayer(
  riversData: FeatureCollection<LineString | MultiLineString>,
  config: RivieresLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_RIVIERES,
    ctx.projectionSuffix
  );

  const dashArray = config.dotted
    ? dottedPatternToDashArray(config.dottedPattern)
    : [0, 0];

  return new GeoJsonLayer({
    id: layerId,
    data: projectFeatureCollectionIfNeeded(riversData, ctx),
    stroked: true,
    filled: false,
    getLineColor: withOpacity(strokeColor, opacity),
    getLineWidth: config.thickness,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 0.5,
    extensions: config.dotted ? [DASH_EXTENSION] : [],
    getDashArray: dashArray,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getLineColor: [config.color, config.opacity],
      getLineWidth: [config.thickness],
      getDashArray: [config.dotted, config.dottedPattern]
    }
  });
}

export function createReliefLayers(
  worldBaseTable: ArrowTable,
  config: ReliefLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow>[] {
  if (!config.visible) return [];

  const geometryInfo = extractGeometryInfo(worldBaseTable);
  if (!geometryInfo) {
    logger.warn(
      'World base table missing geo metadata for relief layer',
      LogCategory.MAP
    );
    return [];
  }

  const baseColor = toRgbColor(config.color);
  const baseOpacity = config.opacity / 100;
  const isContours = config.representation === BasemapRepresentation.CONTOURS;
  const isElevation = config.representation === BasemapRepresentation.ELEVATION;

  const fillOpacity = isContours
    ? 0
    : isElevation
      ? Math.min(baseOpacity * 0.8, 1)
      : Math.min(baseOpacity * 0.5, 1);
  const lineOpacity = isContours
    ? baseOpacity
    : isElevation
      ? Math.min(baseOpacity * 0.7, 1)
      : Math.min(baseOpacity * 0.45, 1);
  const lineWidth = isContours ? 0.8 : isElevation ? 0.5 : 0.35;
  const lineColor = isElevation ? ([96, 96, 96] as RGBColor) : baseColor;

  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_RELIEF,
    ctx.projectionSuffix
  );
  const baseProps = getBaseLayerProps(ctx);

  const updateTriggers = {
    getFillColor: [config.color, config.opacity, config.representation],
    getLineColor: [config.color, config.opacity, config.representation]
  };
  const preferProjectedGeoJsonFallback = shouldPreferProjectedGeoJsonFallback(
    geometryInfo,
    ctx.projection
  );

  if (
    !preferProjectedGeoJsonFallback &&
    (isGeoArrowPolygonEncoding(geometryInfo) || geometryInfo.isNativeGeoArrow)
  ) {
    const result: Layer<DeckDataRow>[] = [];
    const outlineData = ctx.projection
      ? parsePathsWithProjection(worldBaseTable, ctx.projection)
      : parsePaths(worldBaseTable);

    if (!isContours) {
      const polyData = ctx.projection
        ? parseSolidPolygonsWithProjection(worldBaseTable, ctx.projection)
        : parseSolidPolygons(worldBaseTable);
      result.push(
        new SolidPolygonLayer({
          id: layerId,
          ...createCompatibleSolidPolygonLayerProps(polyData),
          getFillColor: withOpacity(baseColor, fillOpacity),
          ...baseProps,
          updateTriggers: {
            getFillColor: [config.color, config.opacity, config.representation]
          }
        })
      );
    }

    result.push(
      new PathLayer({
        id: `${layerId}-stroke`,
        ...createPathLayerProps(outlineData),
        getColor: withOpacity(lineColor, lineOpacity),
        widthUnits: 'pixels',
        getWidth: lineWidth,
        widthMinPixels: 0,
        widthMaxPixels: 1,
        ...baseProps,
        updateTriggers: {
          getColor: [config.color, config.opacity, config.representation],
          getWidth: [lineWidth]
        }
      })
    );

    return result;
  }

  if (canRenderViaGeoJsonFallback(geometryInfo)) {
    const geojson = getPreparedBasemapGeoJSON(
      worldBaseTable,
      geometryInfo.geoColumn,
      ctx
    );
    if (geojson) {
      return [
        new GeoJsonLayer({
          id: layerId,
          data: geojson,
          filled: !isContours,
          stroked: true,
          getFillColor: withOpacity(baseColor, fillOpacity),
          getLineColor: withOpacity(lineColor, lineOpacity),
          lineWidthUnits: 'pixels',
          getLineWidth: lineWidth,
          lineWidthMinPixels: 0,
          lineWidthMaxPixels: 1,
          ...baseProps,
          updateTriggers: {
            ...updateTriggers,
            getLineWidth: [lineWidth]
          }
        })
      ];
    }
    logger.warn(
      'Failed to convert world base table to GeoJSON for relief layer',
      LogCategory.MAP
    );
  }

  return [];
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

function convertCitiesToPolygons(
  cities: FeatureCollection<Point>,
  symbol: BasemapCitySymbol,
  sizePx: number,
  radiusScale?: number
): FeatureCollection<Polygon> {
  const sides = getSymbolPolygonSides(symbol);
  const angleOffset = getSymbolAngleOffset(symbol);
  const isStar = isStarSymbol(symbol);

  const features = cities.features.map((f) => {
    const coords = f.geometry.coordinates as [number, number];
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
      properties: f.properties,
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
  const features = cities.features.filter((f) => {
    const props = f.properties ?? {};
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

function getCitiesFilterKey(config: VillesLayerConfig): string {
  const count = clampBasemapCityCount(config.count);
  return count === undefined ? `category:${config.category}` : `count:${count}`;
}

function getFilteredCitiesForConfig(
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
    cachedPolygonCitiesKey = null;
    cachedPolygonCities = null;
  }

  return cachedFilteredCities;
}

function resolveCityLabel(feature: Feature<Point>): string {
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

export function createVillesLayer(
  citiesData: FeatureCollection<Point>,
  config: VillesLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const filteredCities = getFilteredCitiesForConfig(citiesData, config);

  if (filteredCities.features.length === 0) return null;

  const fillColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_VILLES,
    ctx.projectionSuffix
  );
  const projectedCities = projectFeatureCollectionIfNeeded(
    filteredCities,
    ctx
  ) as FeatureCollection<Point>;
  const filterKey = getCitiesFilterKey(config);

  const isCircle = config.symbol === BasemapCitySymbol.POINT;

  if (isCircle) {
    return new GeoJsonLayer({
      id: layerId,
      data: projectedCities,
      filled: true,
      stroked: true,
      pointType: 'circle',
      getPointRadius: config.size,
      getFillColor: withOpacity(fillColor, opacity),
      getLineColor: withOpacity([0, 0, 0], opacity * 0.5),
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 1,
      pointRadiusUnits: 'pixels',
      pointRadiusMinPixels: 2,
      ...getBaseLayerProps(ctx),
      updateTriggers: {
        getFillColor: [config.color, config.opacity],
        getPointRadius: [config.size],
        data: [filterKey, Boolean(ctx.projection)]
      }
    });
  }

  const polygonKey = `${filterKey}:${config.symbol}:${config.size}`;
  const shouldUseProjectedSymbols = Boolean(ctx.projection);
  if (
    shouldUseProjectedSymbols ||
    cachedPolygonCitiesKey !== polygonKey ||
    !cachedPolygonCities
  ) {
    cachedPolygonCities = convertCitiesToPolygons(
      projectedCities,
      config.symbol,
      config.size,
      shouldUseProjectedSymbols ? 0.5 : undefined
    );
    cachedPolygonCitiesKey = shouldUseProjectedSymbols ? null : polygonKey;
  }

  return new GeoJsonLayer({
    id: layerId,
    data: cachedPolygonCities,
    filled: true,
    stroked: true,
    getFillColor: withOpacity(fillColor, opacity),
    getLineColor: withOpacity([0, 0, 0], opacity * 0.5),
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getFillColor: [config.color, config.opacity],
      data: [filterKey, config.symbol, config.size, Boolean(ctx.projection)]
    }
  });
}

function createVillesLabelLayer(
  citiesData: FeatureCollection<Point>,
  config: VillesLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const filteredCities = getFilteredCitiesForConfig(citiesData, config);
  const labelledCities = {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features: filteredCities.features.filter((feature) =>
      Boolean(resolveCityLabel(feature))
    )
  } satisfies FeatureCollection<Point>;

  if (labelledCities.features.length === 0) return null;

  const projectedCities = projectFeatureCollectionIfNeeded(
    labelledCities,
    ctx
  ) as FeatureCollection<Point>;
  const labelColor = toRgbColor(config.labelColor ?? '#161616');
  const labelSize = config.labelSize ?? 12;
  const labelFontFamily = config.labelFontFamily ?? CARTOGRAPHIC_FONT_FAMILY;
  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_VILLES_LABELS,
    ctx.projectionSuffix
  );

  return new GeoJsonLayer({
    id: layerId,
    data: projectedCities,
    pointType: 'text',
    getText: resolveCityLabel,
    getTextColor: withOpacity(labelColor, 1),
    getTextSize: labelSize,
    getTextAnchor: 'middle',
    getTextAlignmentBaseline: 'top',
    getTextPixelOffset: [0, Math.max(config.size, 1) + 4],
    textFontFamily: resolveFontFamilyStack(labelFontFamily),
    textCharacterSet: DECK_TEXT_CHARACTER_SET,
    textFontSettings: DEFAULT_TEXT_FONT_SETTINGS_RASTER,
    textLineHeight: DEFAULT_TEXT_LINE_HEIGHT,
    textSizeUnits: 'pixels',
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getTextColor: [config.labelColor],
      getTextSize: [labelSize],
      getTextPixelOffset: [config.size],
      textFontFamily: [labelFontFamily],
      data: [getCitiesFilterKey(config), Boolean(ctx.projection)]
    }
  });
}

type MetadataGeometry =
  | Polygon
  | MultiPolygon
  | LineString
  | MultiLineString
  | Point;

function collectMetadataGeoJsonByGeometry<T extends MetadataGeometry>(
  entries: MetadataLayerEntry[],
  geometryTypes: ReadonlySet<string>
): FeatureCollection<T> | null {
  const features: Feature<T>[] = [];

  for (const entry of entries) {
    const geometryInfo = extractGeometryInfo(entry.table);
    if (!geometryInfo) continue;

    const geojson = getCachedBasemapGeoJSON(
      entry.table,
      geometryInfo.geoColumn
    );
    if (!geojson) continue;

    for (const feature of geojson.features) {
      const geometryType = feature.geometry?.type;
      if (!geometryType || !geometryTypes.has(geometryType)) {
        continue;
      }

      features.push(feature as Feature<T>);
    }
  }

  if (features.length === 0) {
    return null;
  }

  return {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features
  };
}

function createPointFeatureFromCoordinates(
  sourceFeature: Feature<MetadataGeometry>,
  coordinates: [number, number]
): Feature<Point> | null {
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return {
    type: GEOJSON_TYPE.FEATURE,
    properties: sourceFeature.properties,
    geometry: {
      type: GEOJSON_TYPE.POINT,
      coordinates
    }
  };
}

function collectMetadataPointGeoJson(
  entries: MetadataLayerEntry[]
): FeatureCollection<Point> | null {
  const features: Feature<Point>[] = [];

  for (const entry of entries) {
    const geometryInfo = extractGeometryInfo(entry.table);
    if (!geometryInfo) continue;

    const geojson = getCachedBasemapGeoJSON(
      entry.table,
      geometryInfo.geoColumn
    );
    if (!geojson) continue;

    for (const feature of geojson.features as Feature<
      Point | MultiPoint | LineString
    >[]) {
      const geometry = feature.geometry;
      if (!geometry) continue;

      if (geometry.type === GEOJSON_TYPE.POINT) {
        features.push(feature as Feature<Point>);
        continue;
      }

      if (geometry.type === GEOJSON_TYPE.MULTI_POINT) {
        for (const coordinates of geometry.coordinates) {
          const pointFeature = createPointFeatureFromCoordinates(
            feature as Feature<MetadataGeometry>,
            coordinates as [number, number]
          );
          if (pointFeature) features.push(pointFeature);
        }
        continue;
      }

      if (
        geometry.type === GEOJSON_TYPE.LINE_STRING &&
        geometry.coordinates.length === 1
      ) {
        const pointFeature = createPointFeatureFromCoordinates(
          feature as Feature<MetadataGeometry>,
          geometry.coordinates[0] as [number, number]
        );
        if (pointFeature) features.push(pointFeature);
      }
    }
  }

  if (features.length === 0) {
    return null;
  }

  return {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features
  };
}

function hasArrowRows(table: ArrowTable): boolean {
  const numRows = (table as ArrowTable & { numRows?: unknown }).numRows;
  return typeof numRows === 'number' ? numRows > 0 : true;
}

export interface MetadataLayerEntry {
  table: ArrowTable;
  style: string | null;
  type: BasemapLayerType;
  file: string;
}

function createMetadataLimitLayers(
  entries: MetadataLayerEntry[],
  ctx: BasemapLayerContext,
  config: FrontieresLayerConfig
): Layer<DeckDataRow>[] {
  return createMetadataLineLayers(
    entries,
    ctx,
    config,
    DeckLayerId.BASEMAP_META_LIMIT
  );
}

type StyledMetadataLineConfig = Pick<
  FrontieresLayerConfig,
  'color' | 'dotted' | 'dottedPattern' | 'thickness' | 'opacity'
>;

function createMetadataLineLayers(
  entries: MetadataLayerEntry[],
  ctx: BasemapLayerContext,
  config: StyledMetadataLineConfig,
  idPrefix: DeckLayerId
): Layer<DeckDataRow>[] {
  if (entries.length === 0) return [];

  const layers: Layer<DeckDataRow>[] = [];
  const baseProps = getBaseLayerProps(ctx);
  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;
  const effectiveThickness = clampBasemapLayerThickness(config.thickness);
  const effectiveOpacity = opacity;
  const dashArray: [number, number] = config.dotted
    ? dottedPatternToDashArray(config.dottedPattern)
    : [0, 0];
  const updateTriggers = {
    getLineColor: [config.color, effectiveOpacity],
    getDashArray: [config.dotted, config.dottedPattern]
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const geometryInfo = extractGeometryInfo(entry.table);
    if (!geometryInfo) continue;
    if (!hasArrowRows(entry.table)) continue;

    const layerId = buildLayerId(
      idPrefix,
      `${ctx.projectionSuffix || DEFAULT_PROJECTION_SUFFIX}-${i}`
    );
    const preferProjectedGeoJsonFallback = shouldPreferProjectedGeoJsonFallback(
      geometryInfo,
      ctx.projection
    );

    if (
      !preferProjectedGeoJsonFallback &&
      isLineGeometry(geometryInfo) &&
      (isGeoArrowLineEncoding(geometryInfo) || geometryInfo.isNativeGeoArrow)
    ) {
      const lineData = ctx.projection
        ? parsePathsWithProjection(entry.table, ctx.projection)
        : parsePaths(entry.table);
      layers.push(
        new PathLayer({
          id: layerId,
          ...createStyledBasemapPathLayerProps(
            lineData,
            withOpacity(strokeColor, effectiveOpacity) as [
              number,
              number,
              number,
              number
            ],
            effectiveThickness
          ),
          widthUnits: 'pixels',
          widthMinPixels: 0,
          widthMaxPixels: BASEMAP_LAYER_CONFIG.thickness.max,
          extensions: config.dotted ? [DASH_EXTENSION] : [],
          getDashArray: dashArray,
          dashJustified: true,
          ...baseProps,
          updateTriggers: {
            ...updateTriggers,
            getWidth: [effectiveThickness]
          }
        })
      );
    } else if (
      !preferProjectedGeoJsonFallback &&
      (isGeoArrowPolygonEncoding(geometryInfo) || geometryInfo.isNativeGeoArrow)
    ) {
      const outlineData = ctx.projection
        ? parsePathsWithProjection(entry.table, ctx.projection)
        : parsePaths(entry.table);
      layers.push(
        new PathLayer({
          id: layerId,
          ...createStyledBasemapPathLayerProps(
            outlineData,
            withOpacity(strokeColor, effectiveOpacity) as [
              number,
              number,
              number,
              number
            ],
            effectiveThickness
          ),
          widthUnits: 'pixels',
          widthMinPixels: 0,
          widthMaxPixels: BASEMAP_LAYER_CONFIG.thickness.max,
          extensions: config.dotted ? [DASH_EXTENSION] : [],
          getDashArray: dashArray,
          dashJustified: true,
          ...baseProps,
          updateTriggers: {
            ...updateTriggers,
            getWidth: [effectiveThickness]
          }
        })
      );
    } else if (canRenderViaGeoJsonFallback(geometryInfo)) {
      const geojson = getPreparedBasemapGeoJSON(
        entry.table,
        geometryInfo.geoColumn,
        ctx
      );
      if (geojson) {
        layers.push(
          new GeoJsonLayer({
            id: layerId,
            data: geojson,
            filled: false,
            stroked: true,
            getLineColor: withOpacity(strokeColor, effectiveOpacity),
            lineWidthUnits: 'pixels',
            getLineWidth: effectiveThickness,
            lineWidthMinPixels: 0,
            lineWidthMaxPixels: BASEMAP_LAYER_CONFIG.thickness.max,
            extensions: config.dotted ? [DASH_EXTENSION] : [],
            getDashArray: dashArray,
            dashJustified: true,
            _subLayerProps: createDashedGeoJsonLineSubLayerProps(
              config.dotted,
              dashArray
            ),
            ...baseProps,
            updateTriggers: {
              ...updateTriggers,
              getLineWidth: [effectiveThickness]
            }
          })
        );
      }
    }
  }

  return layers;
}

export interface BasemapAdditionalData {
  frontieresTable?: ArrowTable;
  metadataLayers?: MetadataLayerEntry[];
  availableMetadataLayerTypes?: BasemapLayerType[];
  stylePresets?: StylePresets | null;
}

export interface BasemapLayerGroups {
  background: Layer<DeckDataRow>[];

  foreground: Layer<DeckDataRow>[];
}

export function createBasemapLayers(
  worldBaseTable: ArrowTable | null,
  ctx: BasemapLayerContext,
  additionalData?: BasemapAdditionalData
): BasemapLayerGroups {
  const backgroundGroups: Layer<DeckDataRow>[][] = [];
  const foregroundGroups: Layer<DeckDataRow>[][] = [];

  const metaLayers = additionalData?.metadataLayers ?? [];
  const availableMetadataLayerTypes = new Set(
    additionalData?.availableMetadataLayerTypes ?? []
  );

  const metaByType = (type: BasemapLayerType) =>
    metaLayers.filter((l) => l.type === type);

  const limitEntries = metaByType(BasemapLayerType.LIMIT);
  const polygonEntries = metaByType(BasemapLayerType.POLYGON);
  const lineEntries = metaByType(BasemapLayerType.LINE);
  const geographicLineEntries = metaByType(BasemapLayerType.GEOGRAPHIC_LINES);
  const pointEntries = metaByType(BasemapLayerType.POINT);
  const centroidEntries = metaByType(BasemapLayerType.CENTROID);
  const hasMetadataLimits =
    availableMetadataLayerTypes.has(BasemapLayerType.LIMIT) ||
    limitEntries.length > 0;
  const isFrontieresVisible = basemapLayersStore.layers.some(
    (layer) => layer.id === BASEMAP_LAYER_ID.FRONTIERES && layer.visible
  );
  const isEquateurVisible = basemapLayersStore.layers.some(
    (layer) => layer.id === BASEMAP_LAYER_ID.EQUATEUR && layer.visible
  );

  for (const config of basemapLayersStore.layers) {
    const hasEntryScopedVisibility =
      config.id === BASEMAP_LAYER_ID.FRONTIERES && hasMetadataLimits;
    if (!config.visible && !hasEntryScopedVisibility) continue;

    try {
      const targetGroups =
        getBasemapRenderGroup(config.id) === 'background'
          ? backgroundGroups
          : foregroundGroups;

      switch (config.id) {
        case BASEMAP_LAYER_ID.MERS: {
          const layer = createMersLayer(config as MersLayerConfig, ctx);
          if (layer) targetGroups.push([layer]);
          break;
        }

        case BASEMAP_LAYER_ID.TERRE: {
          const terreConfig = config as TerreLayerConfig;

          if (worldBaseTable) {
            const terreLayers = createTerreLayers(
              worldBaseTable,
              terreConfig,
              ctx,
              {
                suppressStroke: hasMetadataLimits && isFrontieresVisible
              }
            );
            if (terreLayers.length > 0) {
              targetGroups.push(terreLayers);
            }
          }
          break;
        }

        case BASEMAP_LAYER_ID.LACS: {
          const lakesData = collectMetadataGeoJsonByGeometry<
            Polygon | MultiPolygon
          >(
            polygonEntries,
            new Set([GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON])
          );
          const layer = lakesData
            ? createLacsLayer(lakesData, config as LacsLayerConfig, ctx)
            : null;
          if (layer) {
            targetGroups.push([layer]);
          }
          break;
        }

        case BASEMAP_LAYER_ID.RELIEF:
          if (worldBaseTable) {
            const reliefLayers = createReliefLayers(
              worldBaseTable,
              config as ReliefLayerConfig,
              ctx
            );
            if (reliefLayers.length > 0) {
              targetGroups.push(reliefLayers);
            }
          }
          break;

        case BASEMAP_LAYER_ID.FRONTIERES: {
          if (hasMetadataLimits) {
            const limitLayers = createMetadataLimitLayers(
              limitEntries,
              ctx,
              config as FrontieresLayerConfig
            );
            if (limitLayers.length > 0) {
              targetGroups.push(limitLayers);
            }
          } else if (worldBaseTable) {
            const layer = createFrontieresLayer(
              additionalData?.frontieresTable ?? worldBaseTable,
              config as FrontieresLayerConfig,
              ctx
            );
            if (layer) targetGroups.push([layer]);
          }
          break;
        }

        case BASEMAP_LAYER_ID.RIVIERES: {
          const riversData = collectMetadataGeoJsonByGeometry<
            LineString | MultiLineString
          >(
            lineEntries,
            new Set([GEOJSON_TYPE.LINE_STRING, GEOJSON_TYPE.MULTI_LINE_STRING])
          );
          const layer = riversData
            ? createRivieresLayer(
                riversData,
                config as RivieresLayerConfig,
                ctx
              )
            : null;
          if (layer) {
            targetGroups.push([layer]);
          }
          break;
        }

        case BASEMAP_LAYER_ID.EQUATEUR: {
          const layer = createEquateurLayer(config as EquateurLayerConfig, ctx);
          if (layer) targetGroups.push([layer]);
          break;
        }

        case BASEMAP_LAYER_ID.MERIDIENS: {
          const meridiensConfig = config as MeridiensLayerConfig;
          if (
            meridiensConfig.mode === BasemapGraticuleMode.REMARKABLE &&
            geographicLineEntries.length > 0
          ) {
            const lineLayers = createMetadataLineLayers(
              geographicLineEntries,
              ctx,
              meridiensConfig,
              DeckLayerId.BASEMAP_META_GEO_LINES
            );
            if (lineLayers.length > 0) {
              targetGroups.push(lineLayers);
            }
          } else {
            const effectiveMeridiensConfig =
              meridiensConfig.mode === BasemapGraticuleMode.REMARKABLE
                ? {
                    ...meridiensConfig,
                    mode: BasemapGraticuleMode.REGULAR
                  }
                : meridiensConfig;
            const layer = createMeridiensLayer(effectiveMeridiensConfig, {
              ...ctx,
              excludeEquator: isEquateurVisible
            });
            if (layer) targetGroups.push([layer]);
          }
          break;
        }

        case BASEMAP_LAYER_ID.VILLES: {
          const citiesData = collectMetadataPointGeoJson(
            centroidEntries.length > 0 ? centroidEntries : pointEntries
          );
          const villesConfig = config as VillesLayerConfig;
          const symbolLayer = citiesData
            ? createVillesLayer(citiesData, villesConfig, ctx)
            : null;
          const labelLayer = citiesData
            ? createVillesLabelLayer(citiesData, villesConfig, ctx)
            : null;
          const layers = [symbolLayer, labelLayer].filter(
            (layer): layer is Layer<DeckDataRow> => layer !== null
          );
          if (layers.length > 0) {
            targetGroups.push(layers);
          }
          break;
        }
      }
    } catch (error) {
      logger.error(
        'Failed to create basemap layer; keeping other layers intact',
        LogCategory.MAP,
        {
          layerId: config.id,
          error
        }
      );
    }
  }

  return {
    background: [...backgroundGroups].reverse().flat(),
    foreground: [...foregroundGroups].reverse().flat()
  };
}
