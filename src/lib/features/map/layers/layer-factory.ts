import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer, TextLayer } from '@deck.gl/layers';
import RotatableFillStyleExtension from './rotatable-fill-style-extension';
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
  RGBColor,
  ThematicLayer
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
  withGeoJsonRowHighlight,
  withGeoJsonRowHighlightAccessor,
  withOpacity,
  withRowHighlight,
  withRowHighlightAccessor
} from './layer-helpers';
import { getPatternAtlas, isValidPatternId } from './pattern-texture';

const HIGHLIGHT_DIMMING_FACTOR = 0.3;
const DEFAULT_TEXT_SIZE = 12;
const DEFAULT_HALO_WIDTH = 2;
const DEFAULT_TEXT_FONT = 'IBM Plex Sans, sans-serif';
const HOVER_HIGHLIGHT_COLOR: [number, number, number, number] = [0, 0, 0, 50];

/** Cached RotatableFillStyleExtension instance (reused across renders) */
let fillStyleExtensionInstance: RotatableFillStyleExtension | null = null;

function getFillStyleExtension(): RotatableFillStyleExtension {
  if (!fillStyleExtensionInstance) {
    fillStyleExtensionInstance = new RotatableFillStyleExtension({
      pattern: true
    });
  }
  return fillStyleExtensionInstance;
}

/**
 * Builds fill pattern props for polygon layers when a valid patternId is configured.
 * Returns null if no pattern should be applied.
 */
function buildPatternProps(ctx: LayerContext): {
  extensions: RotatableFillStyleExtension[];
  fillPatternAtlas: HTMLCanvasElement;
  fillPatternMapping: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
  fillPatternMask: boolean;
  getFillPattern: () => string;
  getFillPatternScale: number;
  getFillPatternRotation: number;
} | null {
  const patternId = ctx.viz?.classification?.patternId;
  if (!isValidPatternId(patternId)) {
    return null;
  }

  const { atlas, mapping } = getPatternAtlas();
  if (Object.keys(mapping).length === 0) {
    return null;
  }

  const patternAngle = ctx.viz?.classification?.patternParams?.angle ?? 0;

  return {
    extensions: [getFillStyleExtension()],
    fillPatternAtlas: atlas,
    fillPatternMapping: mapping,
    fillPatternMask: true,
    getFillPattern: () => patternId,
    getFillPatternScale: 200,
    getFillPatternRotation: patternAngle
  };
}

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
): ThematicLayer[] {
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

  const layers: ThematicLayer[] = [];

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
        }) as ThematicLayer
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
        }) as ThematicLayer
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

    const baseFillColor =
      useCategoricalColor && viz
        ? createGeoJsonCategoricalColorAccessor(
            viz.mapping.categoryColumn!,
            categoryColorMap,
            fillColor
          )
        : fillColor;

    const geoJsonFillColor =
      hasHighlights && highlightedRowIds
        ? typeof baseFillColor === 'function'
          ? withGeoJsonRowHighlightAccessor(
              baseFillColor,
              rawFillOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              highlightedRowIds
            )
          : withGeoJsonRowHighlight(
              baseFillColor,
              rawFillOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              highlightedRowIds
            )
        : baseFillColor;

    const geoJsonLineColor = hasHighlights
      ? withGeoJsonRowHighlight(
          strokeColor,
          rawStrokeOpacity,
          HIGHLIGHT_DIMMING_FACTOR,
          highlightedRowIds!
        )
      : withOpacity(strokeColor, rawStrokeOpacity);

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
        getLineColor: geoJsonLineColor,
        getPointRadius: geoJsonRadius,
        pointRadiusUnits: 'pixels',
        lineWidthUnits: 'pixels',
        getLineWidth: strokeWidth / 3,
        opacity: hasHighlights ? 1 : rawFillOpacity,
        pickable: true,
        autoHighlight: true,
        highlightColor: HOVER_HIGHLIGHT_COLOR,
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useCategoricalColor,
            viz?.mapping.categoryColumn,
            categoryColorMap,
            fillColor,
            hasHighlights,
            highlightedRowIds
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
          getLineColor: [
            strokeColor,
            rawStrokeOpacity,
            hasHighlights,
            highlightedRowIds
          ]
        }
      })
    ];
  }

  const baseFillColor =
    useCategoricalColor && viz
      ? createCategoricalColorAccessor(
          viz.mapping.categoryColumn!,
          categoryColorMap
        )
      : fillColor;

  const arrowFillColor =
    hasHighlights && highlightedRowIds
      ? typeof baseFillColor === 'function'
        ? withRowHighlightAccessor(
            baseFillColor,
            rawFillOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            highlightedRowIds
          )
        : withRowHighlight(
            baseFillColor,
            rawFillOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            highlightedRowIds
          )
      : baseFillColor;

  const arrowLineColor = hasHighlights
    ? withRowHighlight(
        strokeColor,
        rawStrokeOpacity,
        HIGHLIGHT_DIMMING_FACTOR,
        highlightedRowIds!
      )
    : withOpacity(strokeColor, rawStrokeOpacity);

  const scatterplotProps: ConstructorParameters<
    typeof geodecklayers.GeoArrowScatterplotLayer
  >[0] = {
    id: layerId,
    data: jsTable,
    stroked: true,
    getFillColor: arrowFillColor,
    getLineColor: arrowLineColor,
    opacity: hasHighlights ? 1 : rawFillOpacity,
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
    autoHighlight: true,
    highlightColor: HOVER_HIGHLIGHT_COLOR,
    ...(modelMatrix && { modelMatrix }),
    ...(beforeId && { beforeId }),
    updateTriggers: {
      getFillColor: [
        useCategoricalColor,
        viz?.mapping.categoryColumn,
        categoryColorMap,
        fillColor,
        hasHighlights,
        highlightedRowIds
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
      getLineColor: [
        strokeColor,
        rawStrokeOpacity,
        hasHighlights,
        highlightedRowIds
      ]
    },
    dataComparator: (newData, oldData) => newData === oldData
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

    const baseLineColorAccessor =
      useChoropleth && viz
        ? (row: DeckDataRow) =>
            withOpacity(
              createChoroplethColorAccessor(
                viz.mapping.valueColumn!,
                viz.classification!.breaks!,
                viz.classification!.colors!
              )(row),
              normalizedLineOpacity
            ) as [number, number, number, number]
        : useCategoricalColor && viz
          ? (row: DeckDataRow) =>
              withOpacity(
                createCategoricalColorAccessor(
                  viz.mapping.categoryColumn!,
                  categoryColorMap
                )(row),
                normalizedLineOpacity
              ) as [number, number, number, number]
          : null;

    const lineColorAccessor =
      hasLineHighlights && lineHighlightedRowIds
        ? baseLineColorAccessor
          ? withRowHighlightAccessor(
              baseLineColorAccessor,
              normalizedLineOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              lineHighlightedRowIds
            )
          : withRowHighlight(
              resolvedLineColor,
              normalizedLineOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              lineHighlightedRowIds
            )
        : (baseLineColorAccessor ??
          withOpacity(resolvedLineColor, normalizedLineOpacity));

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
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
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
          normalizedLineOpacity,
          hasLineHighlights,
          lineHighlightedRowIds
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
      },
      dataComparator: (newData, oldData) => newData === oldData
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

  const baseGeoJsonLineColor =
    useChoropleth && viz
      ? (feature: { properties?: Record<string, unknown> }) =>
          withOpacity(
            createGeoJsonChoroplethColorAccessor(
              viz.mapping.valueColumn!,
              viz.classification!.breaks!,
              viz.classification!.colors!,
              resolvedLineColor
            )(feature),
            normalizedLineOpacity
          ) as [number, number, number, number]
      : useCategoricalColor && viz
        ? (feature: { properties?: Record<string, unknown> }) =>
            withOpacity(
              createGeoJsonCategoricalColorAccessor(
                viz.mapping.categoryColumn!,
                categoryColorMap,
                resolvedLineColor
              )(feature),
              normalizedLineOpacity
            ) as [number, number, number, number]
        : null;

  const geoJsonLineColor =
    hasLineHighlights && lineHighlightedRowIds
      ? baseGeoJsonLineColor
        ? withGeoJsonRowHighlightAccessor(
            baseGeoJsonLineColor,
            normalizedLineOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            lineHighlightedRowIds
          )
        : withGeoJsonRowHighlight(
            resolvedLineColor,
            normalizedLineOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            lineHighlightedRowIds
          )
      : (baseGeoJsonLineColor ??
        withOpacity(resolvedLineColor, normalizedLineOpacity));

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
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
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
          normalizedLineOpacity,
          hasLineHighlights,
          lineHighlightedRowIds
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
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
  } = geometryInfo;

  const useChoropleth = viz && shouldApplyChoropleth(viz);
  const layerId = createThematicLayerId(DeckLayerId.POLYGON_LAYER, ctx);
  const patternProps = buildPatternProps(ctx);

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

  // When a fill pattern is active, force GeoJSON path for reliable FillStyleExtension support.
  // GeoArrow composite layers don't expose the attribute manager that FillStyleExtension requires.
  const forceGeoJsonForPattern = Boolean(patternProps);

  if (
    !forceGeoJsonForPattern &&
    (isNativeGeoArrowPolygon || isNativeGeoArrow)
  ) {
    logger.info('Using GeoArrowPolygonLayer for polygons', LogCategory.MAP, {
      encoding: arrowExtension,
      rows: jsTable.numRows,
      hasVisualization: Boolean(viz)
    });

    const baseArrowFillColor =
      useChoropleth && viz
        ? createChoroplethColorAccessor(
            viz.mapping.valueColumn!,
            viz.classification!.breaks!,
            viz.classification!.colors!
          )
        : null;

    const arrowFillColor =
      hasPolyHighlights && polyHighlightedRowIds
        ? baseArrowFillColor
          ? withRowHighlightAccessor(
              baseArrowFillColor,
              rawPolyFillOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              polyHighlightedRowIds
            )
          : withRowHighlight(
              fillColor,
              rawPolyFillOpacity,
              HIGHLIGHT_DIMMING_FACTOR,
              polyHighlightedRowIds
            )
        : (baseArrowFillColor ??
          ([fillColor[0], fillColor[1], fillColor[2], 255] as [
            number,
            number,
            number,
            number
          ]));

    const arrowStrokeColor = hasPolyHighlights
      ? withRowHighlight(
          strokeColor,
          rawPolyStrokeOpacity,
          HIGHLIGHT_DIMMING_FACTOR,
          polyHighlightedRowIds!
        )
      : withOpacity(strokeColor, rawPolyStrokeOpacity);

    const polygonProps: ConstructorParameters<
      typeof geodecklayers.GeoArrowPolygonLayer
    >[0] = {
      id: layerId,
      data: jsTable,
      filled: true,
      stroked: true,
      getFillColor: arrowFillColor,
      getLineColor: arrowStrokeColor,
      opacity: hasPolyHighlights ? 1 : rawPolyFillOpacity,
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 4,
      pickable: true,
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [
          useChoropleth,
          viz?.mapping.valueColumn,
          viz?.classification?.breaks,
          viz?.classification?.colors,
          fillColor,
          hasPolyHighlights,
          polyHighlightedRowIds
        ],
        getLineColor: [
          strokeColor,
          rawPolyStrokeOpacity,
          hasPolyHighlights,
          polyHighlightedRowIds
        ]
      },
      dataComparator: (newData, oldData) => newData === oldData
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
    hasVisualization: Boolean(viz),
    hasPattern: Boolean(patternProps)
  });

  const baseGeoJsonFillColor =
    useChoropleth && viz
      ? createGeoJsonChoroplethColorAccessor(
          viz.mapping.valueColumn!,
          viz.classification!.breaks!,
          viz.classification!.colors!,
          fillColor
        )
      : null;

  const geoJsonFillColor =
    hasPolyHighlights && polyHighlightedRowIds
      ? baseGeoJsonFillColor
        ? withGeoJsonRowHighlightAccessor(
            baseGeoJsonFillColor,
            rawPolyFillOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
        : withGeoJsonRowHighlight(
            fillColor,
            rawPolyFillOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
      : (baseGeoJsonFillColor ??
        ([fillColor[0], fillColor[1], fillColor[2], 255] as [
          number,
          number,
          number,
          number
        ]));

  const geoJsonStrokeColor = hasPolyHighlights
    ? withGeoJsonRowHighlight(
        strokeColor,
        rawPolyStrokeOpacity,
        HIGHLIGHT_DIMMING_FACTOR,
        polyHighlightedRowIds!
      )
    : withOpacity(strokeColor, rawPolyStrokeOpacity);

  return [
    new GeoJsonLayer({
      id: layerId,
      data: geojsonData,
      getFillColor: geoJsonFillColor,
      getLineColor: geoJsonStrokeColor,
      opacity: hasPolyHighlights ? 1 : rawPolyFillOpacity,
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 4,
      pickable: true,
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
      ...(patternProps && {
        extensions: patternProps.extensions,
        fillPatternAtlas: patternProps.fillPatternAtlas,
        fillPatternMapping: patternProps.fillPatternMapping,
        fillPatternMask: patternProps.fillPatternMask,
        getFillPattern: patternProps.getFillPattern,
        getFillPatternScale: patternProps.getFillPatternScale,
        getFillPatternRotation: patternProps.getFillPatternRotation
      }),
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      updateTriggers: {
        getFillColor: [
          useChoropleth,
          viz?.mapping.valueColumn,
          viz?.classification?.breaks,
          viz?.classification?.colors,
          fillColor,
          hasPolyHighlights,
          polyHighlightedRowIds
        ],
        getLineColor: [
          strokeColor,
          rawPolyStrokeOpacity,
          hasPolyHighlights,
          polyHighlightedRowIds
        ],
        ...(patternProps && {
          getFillPattern: [viz?.classification?.patternId],
          getFillPatternScale: [viz?.classification?.patternId],
          getFillPatternRotation: [viz?.classification?.patternParams?.angle]
        })
      },
      dataComparator: (newData, oldData) => newData === oldData
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
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
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

  // Use visible: false instead of skipping creation — preserves GPU buffers
  // for instant re-display when the user re-enables the primitive filter.
  if (isPrimitiveFilteredOut) {
    thematicLayers = thematicLayers.map(
      (layer) => layer.clone({ visible: false }) as Layer<DeckDataRow>
    );
  }

  const textLayers = createTextOverlayLayers(jsTable, geometryInfo, ctx);
  return [...thematicLayers, ...textLayers];
}
