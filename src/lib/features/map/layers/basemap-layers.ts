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
import { ArrowExtension, createLayerId, DeckLayerId } from '../constants';
import { arrowTableToGeoJSON, extractGeometryInfo } from '../io';
import {
  basemapLayersStore,
  type TerreLayerConfig,
  type MersLayerConfig,
  type FrontieresLayerConfig,
  type EquateurLayerConfig,
  type MeridiensLayerConfig,
  type LacsLayerConfig,
  type RivieresLayerConfig,
  type VillesLayerConfig
} from '../stores/basemap-layers.store.svelte';
import {
  BasemapCityCategory,
  BasemapCitySymbol
} from '$lib/features/main-toolbar/constants';
import type { DeckDataRow, GeometryInfo, RGBColor } from '../types';
import { withOpacity, dottedPatternToDashArray } from './layer-helpers';

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
  projectionSuffix: string | undefined,
  styleFingerprint: string
): string {
  return createLayerId(
    layerType,
    'basemap',
    projectionSuffix
      ? `${projectionSuffix}-${styleFingerprint}`
      : styleFingerprint
  );
}

function isGeoArrowPolygonEncoding(geometryInfo: GeometryInfo): boolean {
  return Boolean(
    geometryInfo.encoding &&
    (geometryInfo.encoding === ArrowExtension.GEOARROW_POLYGON ||
      geometryInfo.encoding === ArrowExtension.GEOARROW_MULTIPOLYGON)
  );
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

  const shadowSuffix = config.fillShadow ? '-shadow' : '';
  const dottedSuffix = config.strokeDotted
    ? `-dotted-${config.strokeDottedPattern}`
    : '';
  const styleFingerprint = `${config.fillColor}-${config.fillOpacity}-${config.strokeColor}-${config.strokeOpacity}-${config.strokeThickness}${shadowSuffix}${dottedSuffix}`;
  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_TERRE,
    ctx.projectionSuffix,
    styleFingerprint
  );
  const baseProps = getBaseLayerProps(ctx);

  const dashArray = config.strokeDotted
    ? dottedPatternToDashArray(config.strokeDottedPattern)
    : [0, 0];

  const updateTriggers = {
    getFillColor: [config.fillColor, config.fillOpacity],
    getLineColor: [config.strokeColor, config.strokeOpacity],
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
          getLineColor: withOpacity([80, 80, 80], 0.3),
          opacity: 1,
          lineWidthUnits: 'pixels',
          lineWidthScale: (config.strokeThickness + 4) / 4,
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
        stroked: config.strokeThickness > 0,
        getFillColor: withOpacity(fillColor, fillOpacity),
        getLineColor: withOpacity(strokeColor, strokeOpacity),
        opacity: 1,
        lineWidthUnits: 'pixels',
        lineWidthScale: config.strokeThickness / 4,
        extensions: config.strokeDotted
          ? [new PathStyleExtension({ dash: true })]
          : [],
        getDashArray: dashArray,
        ...baseProps,
        updateTriggers: {
          ...updateTriggers,
          lineWidthScale: [config.strokeThickness]
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
            getLineColor: withOpacity([80, 80, 80], 0.3),
            lineWidthUnits: 'pixels',
            lineWidthMinPixels: config.strokeThickness + 4,
            ...baseProps,
            updateTriggers: {
              lineWidthMinPixels: [config.strokeThickness]
            }
          })
        );
      }

      layers.push(
        new GeoJsonLayer({
          id: layerId,
          data: geojson,
          filled: true,
          stroked: config.strokeThickness > 0,
          getFillColor: withOpacity(fillColor, fillOpacity),
          getLineColor: withOpacity(strokeColor, strokeOpacity),
          lineWidthUnits: 'pixels',
          lineWidthMinPixels: config.strokeThickness,
          extensions: config.strokeDotted
            ? [new PathStyleExtension({ dash: true })]
            : [],
          getDashArray: dashArray,
          ...baseProps,
          updateTriggers: {
            ...updateTriggers,
            lineWidthMinPixels: [config.strokeThickness]
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

export function createTerreLayer(
  worldBaseTable: ArrowTable,
  config: TerreLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  const layers = createTerreLayers(worldBaseTable, config, ctx);
  return layers.length > 0 ? layers[layers.length - 1] : null;
}

export function createMersLayer(
  config: MersLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const fillColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const styleFingerprint = `${config.color}-${config.opacity}`;
  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_MERS,
    ctx.projectionSuffix,
    styleFingerprint
  );

  const oceanGeoJSON: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
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
  worldBaseTable: ArrowTable,
  config: FrontieresLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const geometryInfo = extractGeometryInfo(worldBaseTable);
  if (!geometryInfo) return null;

  const strokeColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const dottedSuffix = config.dotted ? `-dotted-${config.dottedPattern}` : '';
  const styleFingerprint = `${config.color}-${config.opacity}-${config.thickness}${dottedSuffix}`;
  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_FRONTIERES,
    ctx.projectionSuffix,
    styleFingerprint
  );
  const baseProps = getBaseLayerProps(ctx);

  const dashArray = config.dotted
    ? dottedPatternToDashArray(config.dottedPattern)
    : [0, 0];

  const updateTriggers = {
    getLineColor: [config.color, config.opacity],
    getDashArray: [config.dotted, config.dottedPattern]
  };

  if (
    isGeoArrowPolygonEncoding(geometryInfo) ||
    geometryInfo.isNativeGeoArrow
  ) {
    return new geodecklayers.GeoArrowPolygonLayer({
      id: layerId,
      data: worldBaseTable,
      filled: false,
      stroked: true,
      getLineColor: withOpacity(strokeColor, opacity),
      lineWidthUnits: 'pixels',
      lineWidthScale: config.thickness / 4,
      extensions: config.dotted ? [new PathStyleExtension({ dash: true })] : [],
      getDashArray: dashArray,
      ...baseProps,
      updateTriggers: {
        ...updateTriggers,
        lineWidthScale: [config.thickness]
      }
    });
  }

  if (geometryInfo.isWkbEncoded || geometryInfo.isGeoJsonEncoded) {
    const geojson = arrowTableToGeoJSON(worldBaseTable, geometryInfo.geoColumn);
    if (geojson) {
      return new GeoJsonLayer({
        id: layerId,
        data: geojson,
        filled: false,
        stroked: true,
        getLineColor: withOpacity(strokeColor, opacity),
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: config.thickness,
        extensions: config.dotted
          ? [new PathStyleExtension({ dash: true })]
          : [],
        getDashArray: dashArray,
        ...baseProps,
        updateTriggers: {
          ...updateTriggers,
          lineWidthMinPixels: [config.thickness]
        }
      });
    }
    logger.warn(
      'Failed to convert world base table to GeoJSON for frontieres layer',
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

  const dottedSuffix = config.dotted ? `-dotted-${config.dottedPattern}` : '';
  const styleFingerprint = `${config.color}-${config.opacity}-${config.thickness}${dottedSuffix}`;
  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_EQUATEUR,
    ctx.projectionSuffix,
    styleFingerprint
  );

  const equatorGeoJSON: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Equator' },
        geometry: {
          type: 'LineString',
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
    extensions: config.dotted ? [new PathStyleExtension({ dash: true })] : [],
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

  const dottedSuffix = config.dotted ? `-dotted-${config.dottedPattern}` : '';
  const styleFingerprint = `${config.color}-${config.opacity}-${config.thickness}-${config.remarquables}${dottedSuffix}`;
  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_MERIDIENS,
    ctx.projectionSuffix,
    styleFingerprint
  );

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
    type: 'Feature',
    properties: {},
    geometry: graticule()
  };

  const featuresCollection: FeatureCollection<LineString | MultiLineString> = {
    type: 'FeatureCollection',
    features: [graticuleGeoJSON]
  };

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
    extensions: config.dotted ? [new PathStyleExtension({ dash: true })] : [],
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

  const styleFingerprint = `${config.color}-${config.opacity}-${config.thickness}`;
  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_LACS,
    ctx.projectionSuffix,
    styleFingerprint
  );

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

  const dottedSuffix = config.dotted ? `-dotted-${config.dottedPattern}` : '';
  const styleFingerprint = `${config.color}-${config.opacity}-${config.thickness}${dottedSuffix}`;
  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_RIVIERES,
    ctx.projectionSuffix,
    styleFingerprint
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
    extensions: config.dotted ? [new PathStyleExtension({ dash: true })] : [],
    getDashArray: dashArray,
    ...getBaseLayerProps(ctx),
    updateTriggers: {
      getLineColor: [config.color, config.opacity],
      getLineWidth: [config.thickness],
      getDashArray: [config.dotted, config.dottedPattern]
    }
  });
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
      type: 'Feature' as const,
      properties: f.properties,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [polygon]
      }
    };
  });

  return { type: 'FeatureCollection', features };
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

  return { type: 'FeatureCollection', features };
}

export function createVillesLayer(
  citiesData: FeatureCollection<Point>,
  config: VillesLayerConfig,
  ctx: BasemapLayerContext
): Layer<DeckDataRow> | null {
  if (!config.visible) return null;

  const filteredCities = filterCitiesByCategory(citiesData, config.category);
  if (filteredCities.features.length === 0) return null;

  const fillColor = toRgbColor(config.color);
  const opacity = config.opacity / 100;

  const styleFingerprint = `${config.color}-${config.opacity}-${config.size}-${config.category}-${config.symbol}`;
  const layerId = buildLayerId(
    DeckLayerId.BASEMAP_VILLES,
    ctx.projectionSuffix,
    styleFingerprint
  );

  const isCircle = config.symbol === BasemapCitySymbol.POINT;

  if (isCircle) {
    return new GeoJsonLayer({
      id: layerId,
      data: filteredCities,
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

  const polygonCities = convertCitiesToPolygons(
    filteredCities,
    config.symbol,
    config.size
  );

  return new GeoJsonLayer({
    id: layerId,
    data: polygonCities,
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
}

export function createBasemapLayers(
  worldBaseTable: ArrowTable | null,
  ctx: BasemapLayerContext,
  additionalData?: BasemapAdditionalData
): Layer<DeckDataRow>[] {
  const layers: Layer<DeckDataRow>[] = [];

  for (const config of basemapLayersStore.layers) {
    if (!config.visible) continue;

    switch (config.id) {
      case 'mers': {
        const layer = createMersLayer(config as MersLayerConfig, ctx);
        if (layer) layers.push(layer);
        break;
      }

      case 'terre':
        if (worldBaseTable) {
          const terreLayers = createTerreLayers(
            worldBaseTable,
            config as TerreLayerConfig,
            ctx
          );
          layers.push(...terreLayers);
        }
        break;

      case 'lacs':
        if (additionalData?.lakesData) {
          const layer = createLacsLayer(
            additionalData.lakesData,
            config as LacsLayerConfig,
            ctx
          );
          if (layer) layers.push(layer);
        }
        break;

      case 'rivieres':
        if (additionalData?.riversData) {
          const layer = createRivieresLayer(
            additionalData.riversData,
            config as RivieresLayerConfig,
            ctx
          );
          if (layer) layers.push(layer);
        }
        break;

      case 'frontieres':
        if (worldBaseTable) {
          const layer = createFrontieresLayer(
            worldBaseTable,
            config as FrontieresLayerConfig,
            ctx
          );
          if (layer) layers.push(layer);
        }
        break;

      case 'equateur': {
        const layer = createEquateurLayer(config as EquateurLayerConfig, ctx);
        if (layer) layers.push(layer);
        break;
      }

      case 'meridiens': {
        const layer = createMeridiensLayer(config as MeridiensLayerConfig, ctx);
        if (layer) layers.push(layer);
        break;
      }

      case 'villes':
        if (additionalData?.citiesData) {
          const layer = createVillesLayer(
            additionalData.citiesData,
            config as VillesLayerConfig,
            ctx
          );
          if (layer) layers.push(layer);
        }
        break;

      case 'relief':
        logger.debug(
          'Relief layer not yet implemented - requires DEM data',
          LogCategory.MAP
        );
        break;
    }
  }

  return layers;
}

export function getBasemapLayerOrder(): DeckLayerId[] {
  return [
    DeckLayerId.BASEMAP_MERS,
    DeckLayerId.BASEMAP_TERRE,
    DeckLayerId.BASEMAP_LACS,
    DeckLayerId.BASEMAP_RIVIERES,
    DeckLayerId.BASEMAP_RELIEF,
    DeckLayerId.BASEMAP_FRONTIERES,
    DeckLayerId.BASEMAP_EQUATEUR,
    DeckLayerId.BASEMAP_MERIDIENS,
    DeckLayerId.BASEMAP_VILLES
  ];
}
