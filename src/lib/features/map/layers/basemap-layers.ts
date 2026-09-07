import { COORDINATE_SYSTEM, type Layer } from '@deck.gl/core';
import type { Matrix4 } from '@math.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import { SolidPolygonLayer, PathLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  createPathLayerProps,
  type ProjectionLike
} from '@ateliercartographie/geoarrow-deck-stream';
import {
  parsePaths,
  parseSolidPolygons,
  parsePathsWithProjection,
  parseSolidPolygonsWithProjection,
  pathColorAttr,
  pathWidthAttr,
  projectGeoJSON as _projectGeoJSON
} from '../utils/geoarrow-stream-bridge.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
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
import {
  ArrowExtension,
  createLayerId,
  DeckLayerId,
  BASEMAP_DATASET_ID,
  DEFAULT_PROJECTION_SUFFIX
} from '../constants';
import { GEOJSON_TYPE } from '$lib/features/commons/constants';
import { buildBasemapSubLayerId } from '$lib/features/map/utils/layer-panel-row.utils';
import { arrowTableToGeoJSON, extractGeometryInfo } from '../io';
import {
  basemapLayersStore,
  BASEMAP_LAYER_ID,
  getBasemapRenderGroup,
  type BasemapRenderGroup,
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
  BasemapCitySymbol
} from '$lib/features/commons/constants/visualization.constants';
import { NEUTRAL_CARTOGRAPHY_RGB_COLORS } from '$lib/features/commons/constants/colors.constants';
import {
  CARTOGRAPHIC_FONT_FAMILY,
  resolveFontFamilyStack
} from '$lib/features/step-toolbar';
import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
import type { BBox, DeckDataRow, GeometryInfo, RGBColor } from '../types';
import type { StylePresets } from '../types/basemap.types';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { withOpacity, dottedPatternToDashArray } from './layer-helpers';
import { createCompatibleSolidPolygonLayerProps } from '../utils/solid-polygon-layer-props.utils';
import {
  DEFAULT_TEXT_FONT_SETTINGS_RASTER,
  DEFAULT_TEXT_LINE_HEIGHT,
  extendTextCharacterSet
} from './text-character-set';
import {
  getCachedSpherePolygon,
  SPHERE_BACKGROUND_PARAMETERS as BASEMAP_BACKGROUND_FILL_PARAMETERS
} from '../utils/projection-sphere-mask.utils';
import {
  createProjectedCompositeOceanData,
  getEquatorGeoJSON,
  getGraticuleGeoJSON,
  hasCompositeGraticuleSubProjections,
  normalizeLineBbox,
  projectGraticuleFeatureCollectionIfNeeded,
  type GraticuleClipExtent
} from './basemap-graticule';
import {
  getCitiesFilterKey,
  getFilteredCitiesForConfig,
  getLabelledCitiesForConfig,
  getPolygonCitiesForConfig,
  resolveCityLabel
} from './basemap-cities';
import {
  resolveLandConfig,
  resolveMetadataLineStyle,
  type StyledMetadataLineConfig
} from './basemap-style-resolve';

const DASH_EXTENSION = new PathStyleExtension({
  dash: true,
  highPrecisionDash: true
});
const SOLID_DASH_ARRAY: [number, number] = [1, 0];
const BASEMAP_DEFAULT_THICKNESS_PX = 0.5;
const BASEMAP_TERRE_STROKE_THICKNESS_MAX_PX = 0.5;
const BASEMAP_TERRE_STROKE_OPACITY_MAX = 0.4;
const BASEMAP_TERRE_SHADOW_COLOR: RGBColor = [
  ...NEUTRAL_CARTOGRAPHY_RGB_COLORS.shadow
];
const BASEMAP_TERRE_SHADOW_OPACITY = 0.65;
const BASEMAP_TERRE_SHADOW_WIDTH_PX = 5;
const BASEMAP_TERRE_SHADOW_MIN_WIDTH_PX = 3;
const BASEMAP_TERRE_SHADOW_MAX_WIDTH_PX = 8;
const BASEMAP_WATER_FILL_OPACITY_RATIO = 0.5;
const BASEMAP_RELIEF_ELEVATION_FILL_OPACITY_RATIO = 0.8;
const BASEMAP_RELIEF_DEFAULT_FILL_OPACITY_RATIO = 0.5;
const BASEMAP_RELIEF_ELEVATION_LINE_OPACITY_RATIO = 0.7;
const BASEMAP_RELIEF_DEFAULT_LINE_OPACITY_RATIO = 0.45;
const BASEMAP_RELIEF_CONTOUR_LINE_WIDTH_PX = 0.8;
const BASEMAP_RELIEF_ELEVATION_LINE_WIDTH_PX = 0.5;
const BASEMAP_RELIEF_DEFAULT_LINE_WIDTH_PX = 0.35;
const BASEMAP_CITY_STROKE_COLOR: RGBColor = [
  ...NEUTRAL_CARTOGRAPHY_RGB_COLORS.cityStroke
];
const BASEMAP_CITY_STROKE_OPACITY_RATIO = 0.5;
const basemapGeoJsonCache = new WeakMap<
  ArrowTable,
  Map<string, FeatureCollection | null>
>();
const projectedBasemapGeoJsonCache = new WeakMap<
  FeatureCollection,
  WeakMap<object, FeatureCollection>
>();

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
    FeatureCollection<T, P> | undefined;
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

let cachedMetadataPointSources: FeatureCollection[] | null = null;
let cachedMetadataPointGeoJson: FeatureCollection<Point> | null = null;

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
  return geometryInfo.type.toUpperCase().includes('LINE');
}

function isPolygonGeometry(geometryInfo: GeometryInfo): boolean {
  return geometryInfo.type.toUpperCase().includes('POLYGON');
}

function canRenderViaGeoJsonFallback(geometryInfo: GeometryInfo): boolean {
  return (
    geometryInfo.isNativeGeoArrow ||
    geometryInfo.isWkbEncoded ||
    geometryInfo.isGeoJsonEncoded
  );
}

function toRgbColor(hex: string): RGBColor {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b];
}

function clampBasemapLayerThickness(value: number): number {
  if (!Number.isFinite(value)) {
    return BASEMAP_DEFAULT_THICKNESS_PX;
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
    return [];
  }

  const fillColor = toRgbColor(config.fillColor);
  const strokeColor = toRgbColor(config.strokeColor);
  const fillOpacity = config.fillOpacity / 100;
  const strokeOpacity = config.strokeOpacity / 100;

  const effectiveStrokeThickness = Math.min(
    config.strokeThickness,
    BASEMAP_TERRE_STROKE_THICKNESS_MAX_PX
  );
  const effectiveStrokeOpacity = Math.min(
    strokeOpacity,
    BASEMAP_TERRE_STROKE_OPACITY_MAX
  );
  const shouldRenderStroke =
    config.strokeVisible &&
    effectiveStrokeThickness > 0 &&
    !options?.suppressStroke;

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
  if (
    isGeoArrowPolygonEncoding(geometryInfo) ||
    geometryInfo.isNativeGeoArrow
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
          getColor: withOpacity(
            BASEMAP_TERRE_SHADOW_COLOR,
            BASEMAP_TERRE_SHADOW_OPACITY
          ),
          widthUnits: 'pixels',
          getWidth: BASEMAP_TERRE_SHADOW_WIDTH_PX,
          widthMinPixels: BASEMAP_TERRE_SHADOW_MIN_WIDTH_PX,
          widthMaxPixels: BASEMAP_TERRE_SHADOW_MAX_WIDTH_PX,
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
          widthMaxPixels: BASEMAP_TERRE_STROKE_THICKNESS_MAX_PX,
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
            getLineColor: withOpacity(
              BASEMAP_TERRE_SHADOW_COLOR,
              BASEMAP_TERRE_SHADOW_OPACITY
            ),
            lineWidthUnits: 'pixels',
            getLineWidth: BASEMAP_TERRE_SHADOW_WIDTH_PX,
            lineWidthMinPixels: BASEMAP_TERRE_SHADOW_MIN_WIDTH_PX,
            lineWidthMaxPixels: BASEMAP_TERRE_SHADOW_MAX_WIDTH_PX,
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
          lineWidthMaxPixels: BASEMAP_TERRE_STROKE_THICKNESS_MAX_PX,
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

  const baseLayerId = buildLayerId(
    DeckLayerId.BASEMAP_MERS,
    ctx.projectionSuffix
  );

  if (ctx.projection) {
    // For composites, `parseSphere` only yields the mainland sub-projection's
    // sphere, which under-covers the DOM-TOM insets (#195); use the union of
    // sub-projection extents below instead.
    const sphereData = hasCompositeGraticuleSubProjections(ctx.projection)
      ? null
      : getCachedSpherePolygon(ctx.projection);

    if (sphereData) {
      try {
        const polygonProps = createCompatibleSolidPolygonLayerProps(sphereData);
        return new SolidPolygonLayer({
          id: `${baseLayerId}-sphere`,
          ...polygonProps,
          coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
          getFillColor: withOpacity(fillColor, opacity),
          parameters: BASEMAP_BACKGROUND_FILL_PARAMETERS,
          ...getBaseLayerProps(ctx),
          updateTriggers: {
            getFillColor: [config.color, config.opacity]
          }
        });
      } catch (error) {
        logger.error(
          'Failed to build sphere polygon mers layer, falling back to composite/rectangle',
          LogCategory.MAP,
          error
        );
      }
    }

    const projectedCompositeOceanData = createProjectedCompositeOceanData(
      ctx.projection,
      ctx.graticuleClipExtent
    );

    if (projectedCompositeOceanData) {
      return new GeoJsonLayer({
        id: `${baseLayerId}-composite`,
        data: projectedCompositeOceanData,
        filled: true,
        stroked: false,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getFillColor: withOpacity(fillColor, opacity),
        parameters: BASEMAP_BACKGROUND_FILL_PARAMETERS,
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
    id: `${baseLayerId}-rect`,
    data: oceanGeoJSON,
    filled: true,
    stroked: false,
    getFillColor: withOpacity(fillColor, opacity),
    parameters: BASEMAP_BACKGROUND_FILL_PARAMETERS,
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
  if (
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
    isGeoArrowPolygonEncoding(geometryInfo) ||
    geometryInfo.isNativeGeoArrow
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
  }

  return null;
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
  const equatorGeoJSON = getEquatorGeoJSON();

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
      getDashArray: [config.dotted, config.dottedPattern]
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
  const excludeEquator = Boolean(ctx.excludeEquator);
  const featuresCollection = getGraticuleGeoJSON(
    config.spacingDegrees,
    config.mode,
    excludeEquator
  );

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
    lineWidthMinPixels: BASEMAP_DEFAULT_THICKNESS_PX,
    extensions: [DASH_EXTENSION],
    getDashArray: dashArray,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getLineColor: [config.color, config.opacity],
      getLineWidth: [config.thickness],
      getDashArray: [config.dotted, config.dottedPattern]
    }
  });
}

function createLacsLayer(
  lakesData: FeatureCollection<Polygon | MultiPolygon>,
  config: LacsLayerConfig,
  ctx: BasemapLayerContext,
  layerId = buildLayerId(DeckLayerId.BASEMAP_LACS, ctx.projectionSuffix)
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  return new GeoJsonLayer({
    id: layerId,
    data: projectFeatureCollectionIfNeeded(lakesData, ctx),
    filled: true,
    stroked: config.thickness > 0,
    getFillColor: withOpacity(
      strokeColor,
      opacity * BASEMAP_WATER_FILL_OPACITY_RATIO
    ),
    getLineColor: withOpacity(strokeColor, opacity),
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: config.thickness,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getFillColor: [config.color, config.opacity],
      getLineColor: [config.color, config.opacity]
    }
  });
}

function filterMetadataGeoJsonByGeometry<T extends MetadataGeometry>(
  geojson: FeatureCollection,
  geometryTypes: ReadonlySet<string>
): FeatureCollection<T> | null {
  const features: Feature<T>[] = [];

  for (const feature of geojson.features) {
    const geometryType = feature.geometry?.type;
    if (!geometryType || !geometryTypes.has(geometryType)) {
      continue;
    }

    features.push(feature as Feature<T>);
  }

  if (features.length === 0) {
    return null;
  }

  return {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features
  };
}

function createBinaryLacsLayers(
  table: ArrowTable,
  config: LacsLayerConfig,
  ctx: BasemapLayerContext,
  layerId: string
): Layer<DeckDataRow>[] {
  if (!config.visible) return [];

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;
  const baseProps = getBaseLayerProps(ctx);
  const polyData = ctx.projection
    ? parseSolidPolygonsWithProjection(table, ctx.projection)
    : parseSolidPolygons(table);
  const layers: Layer<DeckDataRow>[] = [
    new SolidPolygonLayer({
      id: layerId,
      ...createCompatibleSolidPolygonLayerProps(polyData),
      getFillColor: withOpacity(
        strokeColor,
        opacity * BASEMAP_WATER_FILL_OPACITY_RATIO
      ),
      ...baseProps,
      updateTriggers: {
        getFillColor: [config.color, config.opacity]
      }
    })
  ];

  if (config.thickness > 0) {
    const outlineData = ctx.projection
      ? parsePathsWithProjection(table, ctx.projection)
      : parsePaths(table);
    layers.push(
      new PathLayer({
        id: `${layerId}-stroke`,
        ...createStyledBasemapPathLayerProps(
          outlineData,
          withOpacity(strokeColor, opacity) as [number, number, number, number],
          clampBasemapLayerThickness(config.thickness)
        ),
        widthUnits: 'pixels',
        widthMinPixels: 0,
        widthMaxPixels: BASEMAP_LAYER_CONFIG.thickness.max,
        ...baseProps,
        updateTriggers: {
          getColor: [config.color, config.opacity],
          getWidth: [config.thickness]
        }
      })
    );
  }

  return layers;
}

function createMetadataLacsLayers(
  entries: MetadataLayerEntry[],
  config: LacsLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow>[] {
  if (entries.length === 0) return [];

  const layers: Layer<DeckDataRow>[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const geometryInfo = extractGeometryInfo(entry.table);
    if (!geometryInfo) continue;
    if (!hasArrowRows(entry.table)) continue;

    const layerId = buildLayerId(
      DeckLayerId.BASEMAP_LACS,
      `${ctx.projectionSuffix || DEFAULT_PROJECTION_SUFFIX}-${i}`
    );

    if (
      isPolygonGeometry(geometryInfo) &&
      (isGeoArrowPolygonEncoding(geometryInfo) || geometryInfo.isNativeGeoArrow)
    ) {
      layers.push(...createBinaryLacsLayers(entry.table, config, ctx, layerId));
    } else if (canRenderViaGeoJsonFallback(geometryInfo)) {
      const geojson = getPreparedBasemapGeoJSON(
        entry.table,
        geometryInfo.geoColumn,
        ctx
      );
      const lakesData = geojson
        ? filterMetadataGeoJsonByGeometry<Polygon | MultiPolygon>(
            geojson,
            new Set([GEOJSON_TYPE.POLYGON, GEOJSON_TYPE.MULTI_POLYGON])
          )
        : null;
      const layer = lakesData
        ? createLacsLayer(lakesData, config, ctx, layerId)
        : null;
      if (layer) {
        layers.push(layer);
      }
    }
  }

  return layers;
}

function createRivieresLayer(
  riversData: FeatureCollection<LineString | MultiLineString>,
  config: RivieresLayerConfig,
  ctx: BasemapLayerContext,
  layerId = buildLayerId(DeckLayerId.BASEMAP_RIVIERES, ctx.projectionSuffix)
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

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
    lineWidthMinPixels: BASEMAP_DEFAULT_THICKNESS_PX,
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

function createBinaryRivieresLayer(
  table: ArrowTable,
  config: RivieresLayerConfig,
  ctx: BasemapLayerContext,
  layerId: string
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;
  const lineData = ctx.projection
    ? parsePathsWithProjection(table, ctx.projection)
    : parsePaths(table);
  const dashArray: [number, number] = config.dotted
    ? dottedPatternToDashArray(config.dottedPattern)
    : [0, 0];

  return new PathLayer({
    id: layerId,
    ...createStyledBasemapPathLayerProps(
      lineData,
      withOpacity(strokeColor, opacity) as [number, number, number, number],
      clampBasemapLayerThickness(config.thickness)
    ),
    widthUnits: 'pixels',
    widthMinPixels: BASEMAP_DEFAULT_THICKNESS_PX,
    widthMaxPixels: BASEMAP_LAYER_CONFIG.thickness.max,
    extensions: config.dotted ? [DASH_EXTENSION] : [],
    getDashArray: dashArray,
    dashJustified: true,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getColor: [config.color, config.opacity],
      getWidth: [config.thickness],
      getDashArray: [config.dotted, config.dottedPattern]
    }
  });
}

function createMetadataRivieresLayers(
  entries: MetadataLayerEntry[],
  config: RivieresLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow>[] {
  if (entries.length === 0) return [];

  const layers: Layer<DeckDataRow>[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const geometryInfo = extractGeometryInfo(entry.table);
    if (!geometryInfo) continue;
    if (!hasArrowRows(entry.table)) continue;

    const layerId = buildLayerId(
      DeckLayerId.BASEMAP_RIVIERES,
      `${ctx.projectionSuffix || DEFAULT_PROJECTION_SUFFIX}-${i}`
    );

    if (
      isLineGeometry(geometryInfo) &&
      (isGeoArrowLineEncoding(geometryInfo) || geometryInfo.isNativeGeoArrow)
    ) {
      const layer = createBinaryRivieresLayer(
        entry.table,
        config,
        ctx,
        layerId
      );
      if (layer) {
        layers.push(layer);
      }
    } else if (canRenderViaGeoJsonFallback(geometryInfo)) {
      const geojson = getPreparedBasemapGeoJSON(
        entry.table,
        geometryInfo.geoColumn,
        ctx
      );
      const riversData = geojson
        ? filterMetadataGeoJsonByGeometry<LineString | MultiLineString>(
            geojson,
            new Set([GEOJSON_TYPE.LINE_STRING, GEOJSON_TYPE.MULTI_LINE_STRING])
          )
        : null;
      const layer = riversData
        ? createRivieresLayer(riversData, config, ctx, layerId)
        : null;
      if (layer) {
        layers.push(layer);
      }
    }
  }

  return layers;
}

export function createReliefLayers(
  worldBaseTable: ArrowTable,
  config: ReliefLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow>[] {
  if (!config.visible) return [];

  const geometryInfo = extractGeometryInfo(worldBaseTable);
  if (!geometryInfo) {
    return [];
  }

  const baseColor = toRgbColor(config.color);
  const baseOpacity = config.opacity / 100;
  const isContours = config.representation === BasemapRepresentation.CONTOURS;
  const isElevation = config.representation === BasemapRepresentation.ELEVATION;

  const fillOpacity = isContours
    ? 0
    : isElevation
      ? Math.min(baseOpacity * BASEMAP_RELIEF_ELEVATION_FILL_OPACITY_RATIO, 1)
      : Math.min(baseOpacity * BASEMAP_RELIEF_DEFAULT_FILL_OPACITY_RATIO, 1);
  const lineOpacity = isContours
    ? baseOpacity
    : isElevation
      ? Math.min(baseOpacity * BASEMAP_RELIEF_ELEVATION_LINE_OPACITY_RATIO, 1)
      : Math.min(baseOpacity * BASEMAP_RELIEF_DEFAULT_LINE_OPACITY_RATIO, 1);
  const lineWidth = isContours
    ? BASEMAP_RELIEF_CONTOUR_LINE_WIDTH_PX
    : isElevation
      ? BASEMAP_RELIEF_ELEVATION_LINE_WIDTH_PX
      : BASEMAP_RELIEF_DEFAULT_LINE_WIDTH_PX;
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
  if (
    isGeoArrowPolygonEncoding(geometryInfo) ||
    geometryInfo.isNativeGeoArrow
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
  }

  return [];
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
      getLineColor: withOpacity(
        BASEMAP_CITY_STROKE_COLOR,
        opacity * BASEMAP_CITY_STROKE_OPACITY_RATIO
      ),
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 1,
      pointRadiusUnits: 'pixels',
      pointRadiusMinPixels: 2,
      ...getBaseLayerProps(ctx),
      updateTriggers: {
        getFillColor: [config.color, config.opacity],
        getPointRadius: [config.size]
      }
    });
  }

  const shouldUseProjectedSymbols = Boolean(ctx.projection);
  const resolvedPolygonCities = getPolygonCitiesForConfig(
    projectedCities,
    config,
    filterKey,
    { projected: shouldUseProjectedSymbols }
  );

  return new GeoJsonLayer({
    id: layerId,
    data: resolvedPolygonCities,
    filled: true,
    stroked: true,
    getFillColor: withOpacity(fillColor, opacity),
    getLineColor: withOpacity(
      BASEMAP_CITY_STROKE_COLOR,
      opacity * BASEMAP_CITY_STROKE_OPACITY_RATIO
    ),
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getFillColor: [config.color, config.opacity]
    }
  });
}

function createVillesLabelLayer(
  citiesData: FeatureCollection<Point>,
  config: VillesLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;
  if (!fontAssetsStore.ready) return null;

  const labelledCities = getLabelledCitiesForConfig(citiesData, config);

  if (labelledCities.features.length === 0) return null;

  const projectedCities = projectFeatureCollectionIfNeeded(
    labelledCities,
    ctx
  ) as FeatureCollection<Point>;
  const labelColor = toRgbColor(config.labelColor ?? '#161616');
  const labelSize = config.labelSize ?? 12;
  const labelFontFamily = config.labelFontFamily ?? CARTOGRAPHIC_FONT_FAMILY;
  const labelGlyphs = new Set<string>();
  for (const feature of projectedCities.features) {
    for (const char of resolveCityLabel(feature)) {
      labelGlyphs.add(char);
    }
  }
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
    textCharacterSet: extendTextCharacterSet(labelGlyphs),
    textFontSettings: DEFAULT_TEXT_FONT_SETTINGS_RASTER,
    textLineHeight: DEFAULT_TEXT_LINE_HEIGHT,
    textSizeUnits: 'pixels',
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getTextColor: [config.labelColor],
      getTextSize: [labelSize],
      getTextPixelOffset: [config.size],
      textFontFamily: [labelFontFamily]
    }
  });
}

type MetadataGeometry =
  Polygon | MultiPolygon | LineString | MultiLineString | Point;

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

function areSameFeatureCollectionSources(
  sources: FeatureCollection[],
  cachedSources: FeatureCollection[] | null
): boolean {
  return (
    cachedSources !== null &&
    cachedSources.length === sources.length &&
    cachedSources.every((source, index) => source === sources[index])
  );
}

function collectMetadataPointGeoJson(
  entries: MetadataLayerEntry[]
): FeatureCollection<Point> | null {
  const sources: FeatureCollection[] = [];

  for (const entry of entries) {
    const geometryInfo = extractGeometryInfo(entry.table);
    if (!geometryInfo) continue;

    const geojson = getCachedBasemapGeoJSON(
      entry.table,
      geometryInfo.geoColumn
    );
    if (!geojson) continue;

    sources.push(geojson);
  }

  if (areSameFeatureCollectionSources(sources, cachedMetadataPointSources)) {
    return cachedMetadataPointGeoJson;
  }

  const features: Feature<Point>[] = [];

  for (const geojson of sources) {
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
    cachedMetadataPointSources = sources;
    cachedMetadataPointGeoJson = null;
    return null;
  }

  cachedMetadataPointSources = sources;
  cachedMetadataPointGeoJson = {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features
  };
  return cachedMetadataPointGeoJson;
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
  // Panel row id this metadata layer's deck layers belong to; lets the render
  // map a per-key LIMIT/LAND layer back to its individual panel row.
  panelRowId?: string;
  // Per-layer style override (keyed by basemap file + layer file in the aux
  // store). Lets two land layers sharing the legacy `terre` config — e.g. the
  // NUTS territory and the surrounding land of a NUTS basemap — be coloured and
  // styled independently instead of being driven by the single shared config.
  styleOverride?: Record<string, unknown>;
}

function createLandLayers(
  entries: MetadataLayerEntry[],
  config: TerreLayerConfig,
  ctx: BasemapLayerContext,
  stylePresets: StylePresets | null | undefined,
  options?: { suppressStroke?: boolean },
  rowIds?: Map<string, string>
): Layer<DeckDataRow>[] {
  const layers: Layer<DeckDataRow>[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!hasArrowRows(entry.table)) continue;

    const landConfig = resolveLandConfig(entry, config, stylePresets);
    const landCtx: BasemapLayerContext = {
      ...ctx,
      projectionSuffix: `${ctx.projectionSuffix || DEFAULT_PROJECTION_SUFFIX}-land-${i}`
    };

    const created = createTerreLayers(
      entry.table,
      landConfig,
      landCtx,
      options
    );
    if (rowIds && entry.panelRowId) {
      for (const layer of created)
        rowIds.set(String(layer.id), entry.panelRowId);
    }
    layers.push(...created);
  }

  return layers;
}

function createMetadataLimitLayers(
  entries: MetadataLayerEntry[],
  ctx: BasemapLayerContext,
  config: FrontieresLayerConfig,
  stylePresets: StylePresets | null | undefined,
  rowIds?: Map<string, string>
): Layer<DeckDataRow>[] {
  return createMetadataLineLayers(
    entries,
    ctx,
    config,
    DeckLayerId.BASEMAP_META_LIMIT,
    stylePresets,
    rowIds
  );
}

function createMetadataLineLayers(
  entries: MetadataLayerEntry[],
  ctx: BasemapLayerContext,
  config: StyledMetadataLineConfig,
  idPrefix: DeckLayerId,
  stylePresets?: StylePresets | null,
  rowIds?: Map<string, string>
): Layer<DeckDataRow>[] {
  if (entries.length === 0) return [];

  const layers: Layer<DeckDataRow>[] = [];
  const baseProps = getBaseLayerProps(ctx);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const geometryInfo = extractGeometryInfo(entry.table);
    if (!geometryInfo) continue;
    if (!hasArrowRows(entry.table)) continue;

    const effective = resolveMetadataLineStyle(entry, config, stylePresets);
    const strokeColor = toRgbColor(effective.color);
    const effectiveOpacity = effective.opacity / 100;
    const effectiveThickness = clampBasemapLayerThickness(effective.thickness);
    const dashArray: [number, number] = effective.dotted
      ? (effective.presetDashArray ??
        dottedPatternToDashArray(effective.dottedPattern))
      : [0, 0];
    const updateTriggers = {
      getLineColor: [effective.color, effectiveOpacity],
      getDashArray: [dashArray[0], dashArray[1]]
    };

    const layerId = buildLayerId(
      idPrefix,
      `${ctx.projectionSuffix || DEFAULT_PROJECTION_SUFFIX}-${i}`
    );
    if (rowIds && entry.panelRowId) {
      rowIds.set(layerId, entry.panelRowId);
    }
    if (
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
          extensions: effective.dotted ? [DASH_EXTENSION] : [],
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
      isGeoArrowPolygonEncoding(geometryInfo) ||
      geometryInfo.isNativeGeoArrow
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
          extensions: effective.dotted ? [DASH_EXTENSION] : [],
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
            extensions: effective.dotted ? [DASH_EXTENSION] : [],
            getDashArray: dashArray,
            dashJustified: true,
            _subLayerProps: createDashedGeoJsonLineSubLayerProps(
              effective.dotted,
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
  hasLandMetadataLayers?: boolean;
  hasLimitMetadataLayers?: boolean;
  stylePresets?: StylePresets | null;
}

export interface BasemapRowOrderEntry {
  id: string;
  renderGroup: BasemapRenderGroup;
  belowThematic: boolean;
}

export interface BasemapLayerGroups {
  background: Layer<DeckDataRow>[];

  foreground: Layer<DeckDataRow>[];

  foregroundBelowThematic: Layer<DeckDataRow>[];

  // Maps each produced deck layer id to the panel row it belongs to, so the
  // render can order the whole pool by the flat layer order.
  rowIdByLayerId: Map<string, string>;

  // Panel rows in panel order (top→bottom), the same sequence the layer panel
  // derives from the basemap config store. The layer arrays above are emitted
  // back→front and flattened, so they cannot be read as a row order.
  rowOrder: BasemapRowOrderEntry[];
}

export function createBasemapLayers(
  worldBaseTable: ArrowTable | null,
  ctx: BasemapLayerContext,
  additionalData?: BasemapAdditionalData
): BasemapLayerGroups {
  const backgroundGroups: Layer<DeckDataRow>[][] = [];
  const foregroundBelowGroups: Layer<DeckDataRow>[][] = [];
  const foregroundAboveGroups: Layer<DeckDataRow>[][] = [];
  // Per-config rows default to `basemap::<configId>`; per-key metadata layers
  // (LAND/LIMIT) get their precise per-file row from the entry's `panelRowId`
  // via the creators, which set it before this fallback runs.
  const rowIdByLayerId = new Map<string, string>();
  const rowOrder: BasemapRowOrderEntry[] = [];

  const metaLayers = additionalData?.metadataLayers ?? [];
  const availableMetadataLayerTypes = new Set(
    additionalData?.availableMetadataLayerTypes ?? []
  );

  const metaByType = (type: BasemapLayerType) =>
    metaLayers.filter((l) => l.type === type);

  const limitEntries = metaByType(BasemapLayerType.LIMIT);
  const landEntries = metaByType(BasemapLayerType.LAND);
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
    if (!config.visible) continue;

    try {
      const targetGroups =
        getBasemapRenderGroup(config.id) === 'background'
          ? backgroundGroups
          : config.renderBelowThematic
            ? foregroundBelowGroups
            : foregroundAboveGroups;
      const groupStart = targetGroups.length;
      const configRowId = buildBasemapSubLayerId(config.id);

      switch (config.id) {
        case BASEMAP_LAYER_ID.MERS: {
          const layer = createMersLayer(config as MersLayerConfig, ctx);
          if (layer) targetGroups.push([layer]);
          break;
        }

        case BASEMAP_LAYER_ID.TERRE: {
          const terreConfig = config as TerreLayerConfig;
          const terreOptions = {
            suppressStroke: hasMetadataLimits && isFrontieresVisible
          };

          if (landEntries.length > 0) {
            const landLayers = createLandLayers(
              landEntries,
              terreConfig,
              ctx,
              additionalData?.stylePresets,
              terreOptions,
              rowIdByLayerId
            );
            if (landLayers.length > 0) {
              targetGroups.push(landLayers);
            }
          } else if (worldBaseTable && !additionalData?.hasLandMetadataLayers) {
            const terreLayers = createTerreLayers(
              worldBaseTable,
              terreConfig,
              ctx,
              terreOptions
            );
            if (terreLayers.length > 0) {
              targetGroups.push(terreLayers);
            }
          }
          break;
        }

        case BASEMAP_LAYER_ID.LACS: {
          const lakesLayers = createMetadataLacsLayers(
            polygonEntries,
            config as LacsLayerConfig,
            ctx
          );
          if (lakesLayers.length > 0) {
            targetGroups.push(lakesLayers);
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
              config as FrontieresLayerConfig,
              additionalData?.stylePresets,
              rowIdByLayerId
            );
            if (limitLayers.length > 0) {
              targetGroups.push(limitLayers);
            }
          } else if (
            worldBaseTable &&
            !additionalData?.hasLimitMetadataLayers
          ) {
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
          const riverLayers = createMetadataRivieresLayers(
            lineEntries,
            config as RivieresLayerConfig,
            ctx
          );
          if (riverLayers.length > 0) {
            targetGroups.push(riverLayers);
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

      // Default each layer this config produced to its `basemap::<configId>`
      // row. Per-key metadata layers already recorded a more specific row via
      // the creators above, so `has` guards against overwriting them.
      const configRowIds: string[] = [];
      for (let g = groupStart; g < targetGroups.length; g += 1) {
        for (const layer of targetGroups[g]) {
          const id = String(layer.id);
          if (!rowIdByLayerId.has(id)) {
            rowIdByLayerId.set(id, configRowId);
          }
          const rowId = rowIdByLayerId.get(id) as string;
          if (!configRowIds.includes(rowId)) {
            configRowIds.push(rowId);
          }
        }
      }
      const renderGroup = getBasemapRenderGroup(config.id);
      for (const id of configRowIds.length > 0 ? configRowIds : [configRowId]) {
        rowOrder.push({
          id,
          renderGroup,
          belowThematic:
            renderGroup === 'foreground' && Boolean(config.renderBelowThematic)
        });
      }
    } catch (error) {
      logger.error(
        'Failed to create catalog basemap layer group',
        LogCategory.MAP,
        error
      );
    }
  }

  const foregroundBelowThematic = [...foregroundBelowGroups].reverse().flat();
  const foregroundAboveThematic = [...foregroundAboveGroups].reverse().flat();

  return {
    background: [...backgroundGroups].reverse().flat(),
    foreground: [...foregroundBelowThematic, ...foregroundAboveThematic],
    foregroundBelowThematic,
    rowIdByLayerId,
    rowOrder
  };
}
