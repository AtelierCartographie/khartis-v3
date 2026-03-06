import type { Layer } from '@deck.gl/core';
import type { Matrix4 } from '@math.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import * as geodecklayers from '@geoarrow/deck.gl-layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import * as d3 from 'd3-geo';
import type {
  FeatureCollection,
  Feature,
  LineString,
  MultiLineString,
  Point,
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
  BasemapRepresentation,
  BasemapCityCategory,
  BasemapCitySymbol
} from '$lib/features/main-toolbar/constants';
import type { DeckDataRow, GeometryInfo, RGBColor } from '../types';
import { withOpacity, dottedPatternToDashArray } from './layer-helpers';

// Shared extension instance — avoids re-allocation per layer per frame
const DASH_EXTENSION = new PathStyleExtension({ dash: true });

// --- Graticule cache (Opt #2) ---
let cachedGraticuleKey: string | null = null;
let cachedGraticuleData: FeatureCollection<
  LineString | MultiLineString
> | null = null;

// --- Cities cache (Opt #3) ---
let cachedCitiesKey: string | null = null;
let cachedCitiesSource: FeatureCollection<Point> | null = null;
let cachedFilteredCities: FeatureCollection<Point> | null = null;
let cachedPolygonCitiesKey: string | null = null;
let cachedPolygonCities: FeatureCollection<Polygon> | null = null;

interface BasemapLayerContext {
  modelMatrix?: Matrix4 | null;
  projectionSuffix?: string;
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

function toRgbColor(hex: string): RGBColor {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b];
}

export function createTerreLayers(
  worldBaseTable: ArrowTable,
  config: TerreLayerConfig,
  ctx: BasemapLayerContext
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

  // Each country border is drawn TWICE (by adjacent polygon strokes).
  // WebGL anti-aliases sub-pixel lines to ~1px minimum visible width.
  // Combined effect: ~2px borders. Cap to 0.5px max to keep borders subtle.
  const effectiveStrokeThickness = Math.min(config.strokeThickness, 0.5);
  const effectiveStrokeOpacity = Math.min(strokeOpacity, 0.4);

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
    if (config.fillShadow) {
      layers.push(
        new geodecklayers.GeoArrowPolygonLayer({
          id: `${layerId}-shadow`,
          data: worldBaseTable,
          filled: false,
          stroked: true,
          getLineColor: withOpacity([80, 80, 80], 0.15),
          opacity: 1,
          lineWidthUnits: 'pixels',
          lineWidthScale: 1,
          lineWidthMinPixels: 1,
          lineWidthMaxPixels: 4,
          ...baseProps,
          updateTriggers: {
            lineWidthScale: [config.strokeThickness]
          }
        })
      );
    }

    layers.push(
      new geodecklayers.GeoArrowPolygonLayer({
        id: layerId,
        data: worldBaseTable,
        filled: true,
        stroked: effectiveStrokeThickness > 0,
        getFillColor: withOpacity(fillColor, fillOpacity),
        getLineColor: withOpacity(strokeColor, effectiveStrokeOpacity),
        opacity: 1,
        lineWidthUnits: 'pixels',
        lineWidthScale: effectiveStrokeThickness,
        lineWidthMinPixels: 0,
        lineWidthMaxPixels: 0.5,
        extensions: config.strokeDotted ? [DASH_EXTENSION] : [],
        getDashArray: dashArray,
        ...baseProps,
        updateTriggers: {
          ...updateTriggers,
          lineWidthScale: [effectiveStrokeThickness]
        }
      })
    );

    return layers;
  }

  if (geometryInfo.isWkbEncoded || geometryInfo.isGeoJsonEncoded) {
    const geojson = arrowTableToGeoJSON(worldBaseTable, geometryInfo.geoColumn);
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
          stroked: effectiveStrokeThickness > 0,
          getFillColor: withOpacity(fillColor, fillOpacity),
          getLineColor: withOpacity(strokeColor, effectiveStrokeOpacity),
          lineWidthUnits: 'pixels',
          getLineWidth: effectiveStrokeThickness,
          lineWidthMinPixels: 0,
          lineWidthMaxPixels: 0.5,
          extensions: config.strokeDotted ? [DASH_EXTENSION] : [],
          getDashArray: dashArray,
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

  // Frontieres also draws polygon outlines, so borders are doubled at shared edges.
  const effectiveThickness = Math.min(config.thickness, 0.5);
  const effectiveOpacity = Math.min(opacity, 0.5);

  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_FRONTIERES,
    ctx.projectionSuffix
  );
  const baseProps = getBaseLayerProps(ctx);

  const dashArray = config.dotted
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
    return new geodecklayers.GeoArrowPathLayer({
      id: layerId,
      data: frontieresTable,
      getColor: withOpacity(strokeColor, effectiveOpacity),
      widthUnits: 'pixels',
      getWidth: effectiveThickness,
      widthMinPixels: 0,
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
    (geometryInfo.isWkbEncoded || geometryInfo.isGeoJsonEncoded)
  ) {
    const geojson = arrowTableToGeoJSON(
      frontieresTable,
      geometryInfo.geoColumn
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
        lineWidthMaxPixels: 0.5,
        extensions: config.dotted ? [DASH_EXTENSION] : [],
        getDashArray: dashArray,
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
    return new geodecklayers.GeoArrowPolygonLayer({
      id: layerId,
      data: frontieresTable,
      filled: false,
      stroked: true,
      getLineColor: withOpacity(strokeColor, effectiveOpacity),
      lineWidthUnits: 'pixels',
      lineWidthScale: effectiveThickness,
      lineWidthMinPixels: 0,
      lineWidthMaxPixels: 0.5,
      extensions: config.dotted ? [DASH_EXTENSION] : [],
      getDashArray: dashArray,
      ...baseProps,
      updateTriggers: {
        ...updateTriggers,
        lineWidthScale: [effectiveThickness]
      }
    });
  }

  if (geometryInfo.isWkbEncoded || geometryInfo.isGeoJsonEncoded) {
    const geojson = arrowTableToGeoJSON(
      frontieresTable,
      geometryInfo.geoColumn
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
        lineWidthMaxPixels: 0.5,
        extensions: config.dotted ? [DASH_EXTENSION] : [],
        getDashArray: dashArray,
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

  const equatorGeoJSON: FeatureCollection = {
    type: GEOJSON_TYPE.FEATURE_COLLECTION,
    features: [
      {
        type: GEOJSON_TYPE.FEATURE,
        properties: { name: 'Equator' },
        geometry: {
          type: GEOJSON_TYPE.LINE_STRING,
          coordinates: [
            [-180, 0],
            [180, 0]
          ]
        }
      }
    ]
  };

  const dashArray = config.dotted
    ? dottedPatternToDashArray(config.dottedPattern)
    : [0, 0];

  return new GeoJsonLayer({
    id: layerId,
    data: equatorGeoJSON,
    stroked: true,
    filled: false,
    getLineColor: withOpacity(strokeColor, opacity),
    getLineWidth: config.thickness,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1,
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

  const graticuleKey = config.remarquables;
  if (cachedGraticuleKey !== graticuleKey || !cachedGraticuleData) {
    const stepMap: Record<string, [number, number]> = {
      'equator-tropics': [30, 23.5],
      major: [15, 15],
      minor: [5, 5],
      all: [10, 10]
    };
    const step = stepMap[config.remarquables] ?? [10, 10];

    const graticule = d3
      .geoGraticule()
      .step(step)
      .extent([
        [-180, -90],
        [180, 90]
      ]);

    const graticuleGeoJSON: Feature<MultiLineString> = {
      type: GEOJSON_TYPE.FEATURE,
      properties: {},
      geometry: graticule()
    };

    cachedGraticuleData = {
      type: GEOJSON_TYPE.FEATURE_COLLECTION,
      features: [graticuleGeoJSON]
    };
    cachedGraticuleKey = graticuleKey;
  }

  const featuresCollection = cachedGraticuleData;

  const dashArray = config.dotted
    ? dottedPatternToDashArray(config.dottedPattern)
    : [0, 0];

  return new GeoJsonLayer({
    id: layerId,
    data: featuresCollection,
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
      getDashArray: [config.dotted, config.dottedPattern],
      data: [config.remarquables]
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
    data: lakesData,
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
    data: riversData,
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

export function createReliefLayer(
  worldBaseTable: ArrowTable,
  config: ReliefLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const geometryInfo = extractGeometryInfo(worldBaseTable);
  if (!geometryInfo) {
    logger.warn(
      'World base table missing geo metadata for relief layer',
      LogCategory.MAP
    );
    return null;
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

  if (
    isGeoArrowPolygonEncoding(geometryInfo) ||
    geometryInfo.isNativeGeoArrow
  ) {
    return new geodecklayers.GeoArrowPolygonLayer({
      id: layerId,
      data: worldBaseTable,
      filled: !isContours,
      stroked: true,
      getFillColor: withOpacity(baseColor, fillOpacity),
      getLineColor: withOpacity(lineColor, lineOpacity),
      lineWidthUnits: 'pixels',
      lineWidthScale: lineWidth,
      lineWidthMinPixels: 0,
      lineWidthMaxPixels: 1,
      ...baseProps,
      updateTriggers: {
        ...updateTriggers,
        lineWidthScale: [lineWidth]
      }
    });
  }

  if (geometryInfo.isWkbEncoded || geometryInfo.isGeoJsonEncoded) {
    const geojson = arrowTableToGeoJSON(worldBaseTable, geometryInfo.geoColumn);
    if (geojson) {
      return new GeoJsonLayer({
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
      });
    }
    logger.warn(
      'Failed to convert world base table to GeoJSON for relief layer',
      LogCategory.MAP
    );
  }

  return null;
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
  isStar: boolean
): number[][] {
  const [cx, cy] = center;
  const radius = sizePx * 0.00001;
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
  sizePx: number
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
      isStar
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

export function createVillesLayer(
  citiesData: FeatureCollection<Point>,
  config: VillesLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  // Cache filtered cities by category and input source reference.
  // This avoids stale data reuse if the caller provides a new cities dataset.
  const filterKey = config.category;
  const isNewSource = cachedCitiesSource !== citiesData;
  if (isNewSource || cachedCitiesKey !== filterKey || !cachedFilteredCities) {
    cachedFilteredCities = filterCitiesByCategory(citiesData, config.category);
    cachedCitiesKey = filterKey;
    cachedCitiesSource = citiesData;
    // Invalidate polygon cache when filter changes
    cachedPolygonCitiesKey = null;
    cachedPolygonCities = null;
  }

  if (cachedFilteredCities.features.length === 0) return null;

  const fillColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_VILLES,
    ctx.projectionSuffix
  );

  const isCircle = config.symbol === BasemapCitySymbol.POINT;

  if (isCircle) {
    return new GeoJsonLayer({
      id: layerId,
      data: cachedFilteredCities,
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
        data: [config.category]
      }
    });
  }

  // Cache polygon conversion by (category, symbol, size)
  const polygonKey = `${config.category}:${config.symbol}:${config.size}`;
  if (cachedPolygonCitiesKey !== polygonKey || !cachedPolygonCities) {
    cachedPolygonCities = convertCitiesToPolygons(
      cachedFilteredCities,
      config.symbol,
      config.size
    );
    cachedPolygonCitiesKey = polygonKey;
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
      data: [config.category, config.symbol, config.size]
    }
  });
}

interface BasemapAdditionalData {
  lakesData?: FeatureCollection<Polygon | MultiPolygon>;
  riversData?: FeatureCollection<LineString | MultiLineString>;
  citiesData?: FeatureCollection<Point>;
  frontieresTable?: ArrowTable;
}

export function createBasemapLayers(
  worldBaseTable: ArrowTable | null,
  ctx: BasemapLayerContext,
  additionalData?: BasemapAdditionalData
): Layer<DeckDataRow>[] {
  const layers: Layer<DeckDataRow>[] = [];

  for (const config of basemapLayersStore.layers) {
    if (!config.visible) continue;

    try {
      switch (config.id) {
        case BASEMAP_LAYER_ID.MERS: {
          const layer = createMersLayer(config as MersLayerConfig, ctx);
          if (layer) layers.push(layer);
          break;
        }

        case BASEMAP_LAYER_ID.TERRE:
          if (worldBaseTable) {
            const terreLayers = createTerreLayers(
              worldBaseTable,
              config as TerreLayerConfig,
              ctx
            );
            layers.push(...terreLayers);
          }
          break;

        case BASEMAP_LAYER_ID.LACS:
          if (additionalData?.lakesData) {
            const layer = createLacsLayer(
              additionalData.lakesData,
              config as LacsLayerConfig,
              ctx
            );
            if (layer) layers.push(layer);
          }
          break;

        case BASEMAP_LAYER_ID.RIVIERES:
          if (additionalData?.riversData) {
            const layer = createRivieresLayer(
              additionalData.riversData,
              config as RivieresLayerConfig,
              ctx
            );
            if (layer) layers.push(layer);
          }
          break;

        case BASEMAP_LAYER_ID.FRONTIERES:
          if (worldBaseTable) {
            const layer = createFrontieresLayer(
              additionalData?.frontieresTable ?? worldBaseTable,
              config as FrontieresLayerConfig,
              ctx
            );
            if (layer) layers.push(layer);
          }
          break;

        case BASEMAP_LAYER_ID.EQUATEUR: {
          const layer = createEquateurLayer(config as EquateurLayerConfig, ctx);
          if (layer) layers.push(layer);
          break;
        }

        case BASEMAP_LAYER_ID.MERIDIENS: {
          const layer = createMeridiensLayer(
            config as MeridiensLayerConfig,
            ctx
          );
          if (layer) layers.push(layer);
          break;
        }

        case BASEMAP_LAYER_ID.VILLES:
          if (additionalData?.citiesData) {
            const layer = createVillesLayer(
              additionalData.citiesData,
              config as VillesLayerConfig,
              ctx
            );
            if (layer) layers.push(layer);
          }
          break;

        case BASEMAP_LAYER_ID.RELIEF:
          if (worldBaseTable) {
            const layer = createReliefLayer(
              worldBaseTable,
              config as ReliefLayerConfig,
              ctx
            );
            if (layer) layers.push(layer);
          }
          break;
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

  return layers;
}
