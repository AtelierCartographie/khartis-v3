import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer, TextLayer } from '@deck.gl/layers';
import * as geodecklayers from '@geoarrow/deck.gl-layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection, Geometry } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import * as m from '$lib/paraglide/messages';
import {
  ArrowExtension,
  createLayerId,
  DeckLayerId,
  GeometryType
} from '../constants';
import { arrowTableToGeoJSON, extractGeometryInfo } from '../io';
import type { PrimitiveFilter } from '$lib/features/commons/store/visualization.store.svelte';
import {
  PrimitiveFilterType,
  ScaleType,
  VisualizationType
} from '$lib/features/commons/store/visualization.store.svelte';
import type {
  DeckDataRow,
  GeometryInfo,
  LayerContext,
  RGBColor
} from '../types';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import {
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols
} from '../utils/data-styling.utils';
import {
  createCategoricalColorAccessor,
  createChoroplethColorAccessor,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonChoroplethColorAccessor,
  createGeoJsonProportionalSizeAccessor,
  createProportionalSizeAccessor,
  withOpacity
} from './layer-helpers';

const HIGHLIGHT_DIMMING_FACTOR = 0.3;
const DEFAULT_TEXT_SIZE = 12;
const DEFAULT_HALO_WIDTH = 2;
const DEFAULT_TEXT_FONT = 'IBM Plex Sans, sans-serif';

export type { LayerContext };

function resolveThematicScopeId(ctx: LayerContext): string {
  return ctx.viz?.id ?? ctx.datasetId ?? 'default';
}

function createThematicLayerId(
  layerType: DeckLayerId,
  ctx: LayerContext
): string {
  return createLayerId(
    layerType,
    resolveThematicScopeId(ctx),
    ctx.projectionSuffix
  );
}

interface TextLayerDatum {
  position: [number, number];
  text: string;
}

function normalizeOpacity(opacity: number | undefined, fallback = 1): number {
  if (typeof opacity !== 'number') return fallback;
  const normalized = opacity > 1 ? opacity / 100 : opacity;
  return Math.min(Math.max(normalized, 0), 1);
}

function resolveTextAnchor(
  align: 'left' | 'center' | 'right' | undefined
): 'start' | 'middle' | 'end' {
  switch (align) {
    case 'left':
      return 'start';
    case 'right':
      return 'end';
    default:
      return 'middle';
  }
}

function resolveStyleColor(
  styleColor: string | string[] | undefined,
  fallback: RGBColor
): RGBColor {
  if (Array.isArray(styleColor) && typeof styleColor[0] === 'string') {
    return hexToRgb(styleColor[0]);
  }
  if (typeof styleColor === 'string') {
    return hexToRgb(styleColor);
  }
  return fallback;
}

function toTextValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function collectCoordinates(
  value: unknown,
  output: Array<[number, number]>
): void {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  const maybeLng = value[0];
  const maybeLat = value[1];

  if (
    typeof maybeLng === 'number' &&
    typeof maybeLat === 'number' &&
    Number.isFinite(maybeLng) &&
    Number.isFinite(maybeLat)
  ) {
    output.push([maybeLng, maybeLat]);
    return;
  }

  for (const nested of value) {
    collectCoordinates(nested, output);
  }
}

function getGeometryAnchor(
  geometry: Geometry | null | undefined
): [number, number] | null {
  if (!geometry || !('coordinates' in geometry)) {
    return null;
  }

  const coordinates: Array<[number, number]> = [];
  collectCoordinates(geometry.coordinates, coordinates);

  if (coordinates.length === 0) {
    return null;
  }

  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    return coordinates[Math.floor(coordinates.length / 2)] ?? null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [lng, lat] of coordinates) {
    if (lng < minX) minX = lng;
    if (lng > maxX) maxX = lng;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  }

  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function createTextLayerData(
  geojson: FeatureCollection,
  primaryColumn: string,
  secondaryColumn?: string
): TextLayerDatum[] {
  const output: TextLayerDatum[] = [];

  for (const feature of geojson.features) {
    const primaryText = toTextValue(feature.properties?.[primaryColumn]);
    if (!primaryText) {
      continue;
    }

    const position = getGeometryAnchor(feature.geometry);
    if (!position) {
      continue;
    }

    const secondaryText = secondaryColumn
      ? toTextValue(feature.properties?.[secondaryColumn])
      : null;

    output.push({
      position,
      text: secondaryText ? `${primaryText}\n${secondaryText}` : primaryText
    });
  }

  return output;
}

function createTextOverlayLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const viz = ctx.viz;
  if (!viz?.mapping.labelColumn) {
    return [];
  }

  const labelOpacity = normalizeOpacity(viz.style.labelOpacity, 1);
  const textOpacity = normalizeOpacity(viz.style.textOpacity, 1);
  const shouldRenderLabelLayer = labelOpacity > 0;
  const shouldRenderTextLayer = textOpacity > 0;

  if (!shouldRenderLabelLayer && !shouldRenderTextLayer) {
    return [];
  }

  let geojsonData: FeatureCollection | null = null;
  try {
    geojsonData = arrowTableToGeoJSON(jsTable, geometryInfo.geoColumn);
  } catch (error) {
    logger.warn(
      'Failed to convert geometry for text overlays, skipping labels/texts',
      LogCategory.MAP,
      {
        datasetId: ctx.datasetId,
        error: error instanceof Error ? error.message : String(error)
      }
    );
    return [];
  }

  if (!geojsonData) {
    return [];
  }

  const layers: Layer<DeckDataRow>[] = [];

  if (shouldRenderLabelLayer) {
    const labelData = createTextLayerData(geojsonData, viz.mapping.labelColumn);
    if (labelData.length > 0) {
      const labelColor = resolveStyleColor(viz.style.labelColor, ctx.fillColor);
      const labelLayerId = createThematicLayerId(DeckLayerId.LABEL_LAYER, ctx);

      layers.push(
        new TextLayer<TextLayerDatum>({
          id: labelLayerId,
          data: labelData,
          getPosition: (d) => d.position,
          getText: (d) => d.text,
          getColor: withOpacity(labelColor, labelOpacity),
          getSize: viz.style.labelSize ?? DEFAULT_TEXT_SIZE,
          sizeUnits: 'pixels',
          getTextAnchor: resolveTextAnchor(viz.style.labelAlign),
          getAlignmentBaseline: 'center',
          fontFamily: DEFAULT_TEXT_FONT,
          fontWeight: '400',
          characterSet: 'auto',
          outlineColor: withOpacity(
            resolveStyleColor(viz.style.labelHaloColor, [255, 255, 255]),
            1
          ),
          outlineWidth: viz.style.labelHalo
            ? (viz.style.labelHaloWidth ?? DEFAULT_HALO_WIDTH)
            : 0,
          billboard: true,
          pickable: false,
          ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
          ...(ctx.beforeId && { beforeId: ctx.beforeId }),
          updateTriggers: {
            getText: [viz.mapping.labelColumn],
            getColor: [viz.style.labelColor, labelOpacity],
            getSize: [viz.style.labelSize],
            getTextAnchor: [viz.style.labelAlign],
            outlineColor: [viz.style.labelHaloColor],
            outlineWidth: [viz.style.labelHalo, viz.style.labelHaloWidth]
          }
        }) as unknown as Layer<DeckDataRow>
      );
    }
  }

  if (shouldRenderTextLayer) {
    const textData = createTextLayerData(
      geojsonData,
      viz.mapping.labelColumn,
      viz.mapping.secondaryLabelColumn
    );
    if (textData.length > 0) {
      const textColor = resolveStyleColor(viz.style.textColor, ctx.fillColor);
      const textLayerId = createThematicLayerId(DeckLayerId.TEXT_LAYER, ctx);

      layers.push(
        new TextLayer<TextLayerDatum>({
          id: textLayerId,
          data: textData,
          getPosition: (d) => d.position,
          getText: (d) => d.text,
          getColor: withOpacity(textColor, textOpacity),
          getSize: viz.style.textSize ?? DEFAULT_TEXT_SIZE,
          sizeUnits: 'pixels',
          getTextAnchor: resolveTextAnchor(viz.style.textAlign),
          getAlignmentBaseline: 'center',
          fontFamily: DEFAULT_TEXT_FONT,
          fontWeight: viz.style.textBold ? '700' : '400',
          characterSet: 'auto',
          outlineColor: withOpacity(
            resolveStyleColor(viz.style.textHaloColor, [255, 255, 255]),
            1
          ),
          outlineWidth: viz.style.textHalo
            ? (viz.style.textHaloWidth ?? DEFAULT_HALO_WIDTH)
            : 0,
          billboard: true,
          pickable: false,
          ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
          ...(ctx.beforeId && { beforeId: ctx.beforeId }),
          updateTriggers: {
            getText: [
              viz.mapping.labelColumn,
              viz.mapping.secondaryLabelColumn
            ],
            getColor: [viz.style.textColor, textOpacity],
            getSize: [viz.style.textSize],
            getTextAnchor: [viz.style.textAlign],
            outlineColor: [viz.style.textHaloColor],
            outlineWidth: [viz.style.textHalo, viz.style.textHaloWidth]
          }
        }) as unknown as Layer<DeckDataRow>
      );
    }
  }

  return layers;
}

export function createPointLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    viz,
    fillColor,
    strokeColor,
    fillOpacity: rawFillOpacity,
    strokeWidth,
    strokeOpacity: rawStrokeOpacity,
    statistics,
    categoryColorMap,
    highlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;
  const hasHighlights = highlightedRowIds && highlightedRowIds.size > 0;
  const fillOpacity = hasHighlights
    ? rawFillOpacity * HIGHLIGHT_DIMMING_FACTOR
    : rawFillOpacity;
  const strokeOpacity = hasHighlights
    ? rawStrokeOpacity * HIGHLIGHT_DIMMING_FACTOR
    : rawStrokeOpacity;
  const { geoColumn, isWkbEncoded, isGeoJsonEncoded } = geometryInfo;
  const arrowExtension = geometryInfo.encoding;

  const useProportionalSymbols = viz && shouldApplyProportionalSymbols(viz);
  const useCategoricalColor = viz && shouldApplyCategorical(viz);
  const { min: minValue, max: maxValue } = statistics;

  const layerId = createThematicLayerId(DeckLayerId.POINT_LAYER, ctx);

  const isNativeGeoArrowPoint =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POINT ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOINT);

  if (!isNativeGeoArrowPoint && (isWkbEncoded || isGeoJsonEncoded)) {
    logger.info(
      'Using GeoJsonLayer fallback for points (WKB/GeoJSON encoded)',
      LogCategory.MAP,
      { arrowExtension, geometryType: geometryInfo.type }
    );

    let geojsonData;
    try {
      geojsonData = arrowTableToGeoJSON(jsTable, geoColumn);
    } catch (error) {
      logger.error(
        'Error converting point geometry to GeoJSON',
        LogCategory.MAP,
        {
          encoding: arrowExtension,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      return [];
    }
    if (!geojsonData) {
      logger.warn(
        'Failed to convert point geometry to GeoJSON',
        LogCategory.MAP,
        {
          encoding: arrowExtension
        }
      );
      showWarning(
        m.error_geometry_conversion_title(),
        m.error_geometry_conversion_message()
      );
      return [];
    }

    const geoJsonFillColor =
      useCategoricalColor && viz
        ? createGeoJsonCategoricalColorAccessor(
            viz.mapping.categoryColumn!,
            categoryColorMap,
            fillColor
          )
        : fillColor;

    const geoJsonRadius =
      useProportionalSymbols && viz
        ? createGeoJsonProportionalSizeAccessor(
            viz.mapping.sizeColumn!,
            minValue,
            maxValue,
            viz.symbols!.minSize,
            viz.symbols!.maxSize,
            viz.symbols!.sizeScale
          )
        : 5;

    return [
      new GeoJsonLayer({
        id: layerId,
        data: geojsonData,
        pointType: 'circle',
        filled: true,
        stroked: true,
        getFillColor: geoJsonFillColor,
        getLineColor: withOpacity(strokeColor, strokeOpacity),
        getPointRadius: geoJsonRadius,
        pointRadiusUnits: 'pixels',
        lineWidthUnits: 'pixels',
        getLineWidth: strokeWidth / 3,
        opacity: fillOpacity,
        pickable: true,
        autoHighlight: false,
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useCategoricalColor,
            viz?.mapping.categoryColumn,
            categoryColorMap,
            fillColor
          ],
          getPointRadius: [
            useProportionalSymbols,
            viz?.mapping.sizeColumn,
            minValue,
            maxValue,
            viz?.symbols?.minSize,
            viz?.symbols?.maxSize,
            viz?.symbols?.sizeScale
          ],
          getLineColor: [strokeColor, strokeOpacity]
        }
      })
    ];
  }

  const scatterplotProps: ConstructorParameters<
    typeof geodecklayers.GeoArrowScatterplotLayer
  >[0] = {
    id: layerId,
    data: jsTable,
    stroked: true,
    getFillColor:
      useCategoricalColor && viz
        ? createCategoricalColorAccessor(
            viz.mapping.categoryColumn!,
            categoryColorMap
          )
        : fillColor,
    getLineColor: withOpacity(strokeColor, strokeOpacity),
    opacity: fillOpacity,
    getRadius:
      useProportionalSymbols && viz
        ? createProportionalSizeAccessor(
            viz.mapping.sizeColumn!,
            minValue,
            maxValue,
            viz.symbols!.minSize,
            viz.symbols!.maxSize,
            viz.symbols!.sizeScale
          )
        : 1,
    radiusScale: useProportionalSymbols ? 1 : 5,
    radiusUnits: 'pixels',
    lineWidthUnits: 'pixels',
    lineWidthScale: strokeWidth / 3,
    pickable: true,
    autoHighlight: false,
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    updateTriggers: {
      getFillColor: [
        useCategoricalColor,
        viz?.mapping.categoryColumn,
        categoryColorMap,
        fillColor
      ],
      getRadius: [
        useProportionalSymbols,
        viz?.mapping.sizeColumn,
        minValue,
        maxValue,
        viz?.symbols?.minSize,
        viz?.symbols?.maxSize,
        viz?.symbols?.sizeScale
      ],
      getLineColor: [strokeColor, strokeOpacity]
    }
  };

  return [new geodecklayers.GeoArrowScatterplotLayer(scatterplotProps)];
}

export function createLineLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    viz,
    fillColor,
    fillOpacity: rawLineFillOpacity,
    strokeWidth,
    statistics,
    categoryColorMap,
    highlightedRowIds: lineHighlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;

  const styleLineColor = viz?.style.lineColor;
  const resolvedLineColor =
    typeof styleLineColor === 'string' ? hexToRgb(styleLineColor) : fillColor;
  const styleLineOpacity = viz?.style.lineOpacity;
  const normalizedLineOpacity =
    typeof styleLineOpacity === 'number'
      ? styleLineOpacity > 1
        ? styleLineOpacity / 100
        : styleLineOpacity
      : rawLineFillOpacity;
  const resolvedLineWidth = viz?.style.lineWidth ?? strokeWidth;

  const hasLineHighlights =
    lineHighlightedRowIds && lineHighlightedRowIds.size > 0;
  const fillOpacity = hasLineHighlights
    ? normalizedLineOpacity * HIGHLIGHT_DIMMING_FACTOR
    : normalizedLineOpacity;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
  } = geometryInfo;
  const useChoropleth = viz && shouldApplyChoropleth(viz);
  const useCategoricalColor = viz && shouldApplyCategorical(viz);
  const useProportionalWidth =
    viz?.type === VisualizationType.PROPORTIONAL && !!viz.mapping.sizeColumn;
  const { min: minValue, max: maxValue } = statistics;
  const resolvedSizeScale = viz?.symbols?.sizeScale ?? ScaleType.LINEAR;
  const maxLineWidth = viz?.style.lineMaxWidth ?? resolvedLineWidth;

  const layerId = createThematicLayerId(DeckLayerId.LINE_LAYER, ctx);

  const isNativeGeoArrowLine =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_LINESTRING ||
      arrowExtension === ArrowExtension.GEOARROW_MULTILINESTRING);

  if (isNativeGeoArrowLine || isNativeGeoArrow) {
    logger.info('Using GeoArrowPathLayer for lines', LogCategory.MAP, {
      encoding: arrowExtension,
      rows: jsTable.numRows
    });

    const lineColorAccessor =
      useChoropleth && viz
        ? (row: DeckDataRow) =>
            withOpacity(
              createChoroplethColorAccessor(
                viz.mapping.valueColumn!,
                viz.classification!.breaks!,
                viz.classification!.colors!
              )(row),
              fillOpacity
            )
        : useCategoricalColor && viz
          ? (row: DeckDataRow) =>
              withOpacity(
                createCategoricalColorAccessor(
                  viz.mapping.categoryColumn!,
                  categoryColorMap
                )(row),
                fillOpacity
              )
          : withOpacity(resolvedLineColor, fillOpacity);

    const lineWidthAccessor =
      useProportionalWidth && viz
        ? createProportionalSizeAccessor(
            viz.mapping.sizeColumn!,
            minValue,
            maxValue,
            1,
            maxLineWidth,
            resolvedSizeScale
          )
        : resolvedLineWidth;

    const pathProps: ConstructorParameters<
      typeof geodecklayers.GeoArrowPathLayer
    >[0] = {
      id: layerId,
      data: jsTable,
      getColor: lineColorAccessor,
      widthUnits: 'pixels',
      getWidth: lineWidthAccessor,
      widthMinPixels: 1,
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getColor: [
          useChoropleth,
          useCategoricalColor,
          viz?.mapping.valueColumn,
          viz?.mapping.categoryColumn,
          viz?.classification?.breaks,
          viz?.classification?.colors,
          categoryColorMap,
          resolvedLineColor,
          fillOpacity
        ],
        getWidth: [
          useProportionalWidth,
          viz?.mapping.sizeColumn,
          minValue,
          maxValue,
          maxLineWidth,
          resolvedSizeScale,
          resolvedLineWidth
        ]
      }
    };

    return [new geodecklayers.GeoArrowPathLayer(pathProps)];
  }

  if (!isWkbEncoded && !isGeoJsonEncoded) {
    logger.warn(
      'Unknown line encoding, attempting GeoJSON fallback',
      LogCategory.MAP,
      { arrowExtension }
    );
  }

  let lineGeojsonData;
  try {
    lineGeojsonData = arrowTableToGeoJSON(jsTable, geoColumn);
  } catch (error) {
    logger.error('Error converting line geometry to GeoJSON', LogCategory.MAP, {
      encoding: arrowExtension,
      geoColumn,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
  if (!lineGeojsonData) {
    logger.warn('Failed to convert line geometry to GeoJSON', LogCategory.MAP, {
      encoding: arrowExtension,
      geoColumn
    });
    showWarning(
      m.error_geometry_conversion_title(),
      m.error_geometry_conversion_message()
    );
    return [];
  }

  logger.info('Using GeoJsonLayer fallback for lines', LogCategory.MAP, {
    encoding: arrowExtension,
    featureCount: lineGeojsonData.features.length
  });

  const geoJsonLineColor =
    useChoropleth && viz
      ? (feature: { properties?: Record<string, unknown> }) =>
          withOpacity(
            createGeoJsonChoroplethColorAccessor(
              viz.mapping.valueColumn!,
              viz.classification!.breaks!,
              viz.classification!.colors!,
              resolvedLineColor
            )(feature),
            fillOpacity
          )
      : useCategoricalColor && viz
        ? (feature: { properties?: Record<string, unknown> }) =>
            withOpacity(
              createGeoJsonCategoricalColorAccessor(
                viz.mapping.categoryColumn!,
                categoryColorMap,
                resolvedLineColor
              )(feature),
              fillOpacity
            )
        : withOpacity(resolvedLineColor, fillOpacity);

  const geoJsonLineWidth =
    useProportionalWidth && viz
      ? createGeoJsonProportionalSizeAccessor(
          viz.mapping.sizeColumn!,
          minValue,
          maxValue,
          1,
          maxLineWidth,
          resolvedSizeScale,
          resolvedLineWidth
        )
      : resolvedLineWidth;

  return [
    new GeoJsonLayer({
      id: layerId,
      data: lineGeojsonData,
      stroked: true,
      filled: false,
      getLineColor: geoJsonLineColor,
      lineWidthUnits: 'pixels',
      getLineWidth: geoJsonLineWidth,
      lineWidthMinPixels: 1,
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getLineColor: [
          useChoropleth,
          useCategoricalColor,
          viz?.mapping.valueColumn,
          viz?.mapping.categoryColumn,
          viz?.classification?.breaks,
          viz?.classification?.colors,
          categoryColorMap,
          resolvedLineColor,
          fillOpacity
        ],
        getLineWidth: [
          useProportionalWidth,
          viz?.mapping.sizeColumn,
          minValue,
          maxValue,
          maxLineWidth,
          resolvedSizeScale,
          resolvedLineWidth
        ]
      }
    })
  ];
}

export function createPolygonLayers(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    viz,
    fillColor,
    strokeColor,
    fillOpacity: rawPolyFillOpacity,
    strokeWidth,
    strokeOpacity: rawPolyStrokeOpacity,
    highlightedRowIds: polyHighlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;
  const hasPolyHighlights =
    polyHighlightedRowIds && polyHighlightedRowIds.size > 0;
  const fillOpacity = hasPolyHighlights
    ? rawPolyFillOpacity * HIGHLIGHT_DIMMING_FACTOR
    : rawPolyFillOpacity;
  const strokeOpacity = hasPolyHighlights
    ? rawPolyStrokeOpacity * HIGHLIGHT_DIMMING_FACTOR
    : rawPolyStrokeOpacity;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
  } = geometryInfo;

  const useChoropleth = viz && shouldApplyChoropleth(viz);
  const layerId = createThematicLayerId(DeckLayerId.POLYGON_LAYER, ctx);

  if (!isNativeGeoArrow && !isGeoJsonEncoded && !isWkbEncoded) {
    logger.info(
      'Skipping polygon layer - missing geometry extension metadata',
      LogCategory.MAP,
      {
        geoColumn,
        arrowExtension,
        note: 'Polygons require proper geometry metadata to render'
      }
    );
    return [];
  }

  const isNativeGeoArrowPolygon =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POLYGON ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOLYGON);

  if (isNativeGeoArrowPolygon || isNativeGeoArrow) {
    logger.info('Using GeoArrowPolygonLayer for polygons', LogCategory.MAP, {
      encoding: arrowExtension,
      rows: jsTable.numRows,
      hasVisualization: Boolean(viz)
    });

    const arrowFillColor =
      useChoropleth && viz
        ? createChoroplethColorAccessor(
            viz.mapping.valueColumn!,
            viz.classification!.breaks!,
            viz.classification!.colors!
          )
        : ([fillColor[0], fillColor[1], fillColor[2], 255] as [
            number,
            number,
            number,
            number
          ]);

    const polygonProps: ConstructorParameters<
      typeof geodecklayers.GeoArrowPolygonLayer
    >[0] = {
      id: layerId,
      data: jsTable,
      filled: true,
      stroked: true,
      getFillColor: arrowFillColor,
      getLineColor: withOpacity(strokeColor, strokeOpacity),
      opacity: fillOpacity,
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 4,
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [
          useChoropleth,
          viz?.mapping.valueColumn,
          viz?.classification?.breaks,
          viz?.classification?.colors,
          fillColor
        ],
        getLineColor: [strokeColor, strokeOpacity]
      }
    };

    return [new geodecklayers.GeoArrowPolygonLayer(polygonProps)];
  }

  let geojsonData;
  try {
    geojsonData = arrowTableToGeoJSON(jsTable, geoColumn);
  } catch (error) {
    logger.error(
      'Error converting polygon geometry to GeoJSON',
      LogCategory.MAP,
      {
        encoding: arrowExtension,
        geoColumn,
        error: error instanceof Error ? error.message : String(error)
      }
    );
    return [];
  }
  if (!geojsonData) {
    logger.warn('Failed to convert geometry to GeoJSON', LogCategory.MAP, {
      encoding: arrowExtension
    });
    showWarning(
      m.error_geometry_conversion_title(),
      m.error_geometry_conversion_message()
    );
    return [];
  }

  logger.info('Using GeoJsonLayer fallback for polygons', LogCategory.MAP, {
    encoding: arrowExtension,
    featureCount: geojsonData.features.length,
    hasVisualization: Boolean(viz)
  });

  const defaultFillWithAlpha = [
    fillColor[0],
    fillColor[1],
    fillColor[2],
    255
  ] as [number, number, number, number];
  const geoJsonFillColor =
    useChoropleth && viz
      ? createGeoJsonChoroplethColorAccessor(
          viz.mapping.valueColumn!,
          viz.classification!.breaks!,
          viz.classification!.colors!,
          fillColor
        )
      : defaultFillWithAlpha;

  return [
    new GeoJsonLayer({
      id: layerId,
      data: geojsonData,
      getFillColor: geoJsonFillColor,
      getLineColor: withOpacity(strokeColor, strokeOpacity),
      opacity: fillOpacity,
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 4,
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [
          useChoropleth,
          viz?.mapping.valueColumn,
          viz?.classification?.breaks,
          viz?.classification?.colors,
          fillColor
        ],
        getLineColor: [strokeColor, strokeOpacity]
      }
    })
  ];
}

export function createGeoJsonLayers(
  geojson: FeatureCollection,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const {
    fillColor,
    strokeColor,
    fillOpacity,
    strokeWidth,
    strokeOpacity,
    modelMatrix,
    beforeId
  } = ctx;

  const layerId = createThematicLayerId(DeckLayerId.GEOJSON_LAYER, ctx);

  return [
    new GeoJsonLayer({
      id: layerId,
      data: geojson,
      filled: true,
      stroked: true,
      getFillColor: [...fillColor, Math.round(fillOpacity * 255)],
      getLineColor: withOpacity(strokeColor, strokeOpacity),
      getLineWidth: strokeWidth,
      lineWidthMinPixels: Math.max(1, strokeWidth),
      pickable: true,
      autoHighlight: false,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [fillColor, fillOpacity],
        getLineColor: [strokeColor, strokeOpacity],
        getLineWidth: [strokeWidth]
      }
    })
  ];
}

export function createDeckLayers(
  jsTable: ArrowTable,
  ctx: LayerContext
): Layer<DeckDataRow>[] {
  const geometryInfo = extractGeometryInfo(jsTable);

  if (!geometryInfo) {
    const hasUserDataset = Boolean(ctx.datasetId);
    if (hasUserDataset) {
      logger.error('No GeoArrow metadata in Arrow table', LogCategory.MAP, {
        datasetId: ctx.datasetId
      });
    }
    return [];
  }

  const resolvedGeometryType = geometryInfo.type;

  const primitiveMap: Record<string, PrimitiveFilter> = {
    [GeometryType.POINT]: PrimitiveFilterType.POINT,
    [GeometryType.MULTIPOINT]: PrimitiveFilterType.POINT,
    [GeometryType.LINESTRING]: PrimitiveFilterType.LINE,
    [GeometryType.MULTILINESTRING]: PrimitiveFilterType.LINE,
    [GeometryType.POLYGON]: PrimitiveFilterType.POLYGON,
    [GeometryType.MULTIPOLYGON]: PrimitiveFilterType.POLYGON
  };

  const primitive = primitiveMap[resolvedGeometryType];
  const isPrimitiveFilteredOut =
    primitive &&
    ctx.viz?.primitiveFilters &&
    !ctx.viz.primitiveFilters.includes(primitive);

  let thematicLayers: Layer<DeckDataRow>[] = [];
  if (!isPrimitiveFilteredOut) {
    switch (resolvedGeometryType) {
      case GeometryType.POINT:
      case GeometryType.MULTIPOINT:
        thematicLayers = createPointLayers(jsTable, geometryInfo, ctx);
        break;

      case GeometryType.LINESTRING:
      case GeometryType.MULTILINESTRING:
        thematicLayers = createLineLayers(jsTable, geometryInfo, ctx);
        break;

      case GeometryType.POLYGON:
      case GeometryType.MULTIPOLYGON:
        thematicLayers = createPolygonLayers(jsTable, geometryInfo, ctx);
        break;

      default:
        logger.error(
          'Unsupported geometry type for Deck layer',
          LogCategory.MAP,
          {
            geometryType: resolvedGeometryType,
            datasetId: ctx.datasetId
          }
        );
    }
  }

  const textLayers = createTextOverlayLayers(jsTable, geometryInfo, ctx);
  return [...thematicLayers, ...textLayers];
}
