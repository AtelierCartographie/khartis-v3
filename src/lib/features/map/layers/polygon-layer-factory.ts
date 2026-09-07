import type { Layer } from '@deck.gl/core';
import { GeoJsonLayer, PathLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  createPathLayerProps,
  createPolygonFillColorAttribute
} from '@ateliercartographie/geoarrow-deck-stream';

import {
  DEFAULT_COLORS,
  FillMode,
  StrokeMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  getEnabledPrimitiveFilters,
  getPolygonPrimitive,
  getPrimitiveClassification,
  type PrimitiveFilter,
  PrimitiveFilterType
} from '$lib/features/commons/stores/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import * as m from '$lib/paraglide/messages';

import { ArrowExtension, DeckLayerId } from '../constants';
import type {
  DeckDataRow,
  GeometryInfo,
  LayerContext,
  RGBColor
} from '../types';
import {
  shouldApplyCategorical,
  shouldApplyChoropleth
} from '../utils/data-styling.utils';
import { pathColorAttr } from '../utils/geoarrow-stream-bridge.utils';
import { resolveHoverHighlightProps } from '../utils/hover-highlight-props.utils';
import { createCompatibleSolidPolygonLayerProps } from '../utils/solid-polygon-layer-props.utils';
import {
  createCategoricalColorAccessor,
  createCategoryIndexAccessor,
  createChoroplethColorAccessor,
  createClassIndexAccessor,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonCategoryIndexAccessor,
  createGeoJsonChoroplethColorAccessor,
  createGeoJsonClassIndexAccessor,
  resolveMissingDataRenderProps,
  withGeoJsonRowHighlight,
  withGeoJsonRowHighlightAccessor,
  withOpacity,
  withOpacityPreservingAlpha,
  withRowHighlight,
  withRowHighlightAccessor
} from './layer-helpers';
import {
  getCachedGeoJSON,
  getCachedProjectedGeoJSON
} from './layer-geojson-cache';
import {
  resolvePathParser,
  resolvePolygonParser
} from './layer-geometry-parsers';
import { HIGHLIGHT_DIMMING_FACTOR } from './layer-highlight.utils';
import { createThematicLayerId } from './layer-id.utils';
import {
  createHighlightedBinaryPolygonOverlay,
  createHighlightedPolygonOverlay
} from './layer-selection-overlays';
import { attachBinaryPickingMetadata } from './layer-source.utils';
import {
  DASH_EXTENSION,
  normalizeOpacity,
  resolvePageDisplayScale,
  resolveThematicStrokeCapRounded,
  resolveThematicStrokeDashArray
} from './layer-style.utils';
import {
  createSplitAwareRowAccessor as ctxRowAccessor,
  createSplitGeoJsonFeatureAccessor,
  withPrimitiveScope
} from './split-rendering-accessors';
import {
  buildCategoryColorMapFromLabels,
  resolveEffectiveCategoryColorMap,
  resolveStyleColor
} from './layer-color.utils';
import {
  buildMissingDataPatternProps,
  buildPatternProps,
  createBinaryPolygonPatternOverlayLayer,
  createClassPatternProps,
  createPolygonPatternOverlayLayer,
  resolveClassPatternPalette,
  resolveMissingDataClassPattern,
  resolveMissingDataPatternId
} from './polygon-pattern-layer.utils';
import {
  createClassPatternColorAccessor,
  createGeoJsonClassPatternColorAccessor,
  createGeoJsonPatternBackgroundFillAccessor,
  createGeoJsonPatternOverlayColorAccessor,
  createGeoJsonUniqueClassPatternIndexAccessor,
  createGeoJsonUniquePatternBaseFillAccessor,
  createMissingPolygonPatternColorAccessor,
  createPatternBackgroundFillAccessor,
  createSplitUniqueBinaryColorAccessor,
  createSplitUniqueGeoJsonColorAccessor,
  createUniqueClassPatternIndexAccessor,
  createUniquePatternBaseFillAccessor,
  filterMissingPolygonPatternFeatures,
  filterSplitMatchedPolygonFeatures
} from './polygon-fill-accessors.utils';
import { orderPrimitiveLayers } from './primitive-layer-order';

const POLYGON_STROKE_WIDTH_DIVISOR = 4;

type PointLayerFactory = (
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext
) => Layer<DeckDataRow>[];

type RepresentativePointLayerFactory = (
  jsTable: ArrowTable,
  ctx: LayerContext
) => Layer<DeckDataRow>[];

export type PolygonLayerDependencies = {
  createPointLayers: PointLayerFactory;
  createRepresentativePointSymbolLayers: RepresentativePointLayerFactory;
};

export function createPolygonLayerStack(
  jsTable: ArrowTable,
  geometryInfo: GeometryInfo,
  ctx: LayerContext,
  deps: PolygonLayerDependencies
): Layer<DeckDataRow>[] {
  const { createPointLayers, createRepresentativePointSymbolLayers } = deps;
  const {
    viz,
    fillColor,
    strokeColor,
    fillOpacity: rawPolyFillOpacity,
    strokeWidth,
    strokeOpacity: rawPolyStrokeOpacity,
    highlightedRowIds: polyHighlightedRowIds,
    modelMatrix,
    beforeId,
    categoryColorMap
  } = ctx;
  const pageDisplayScale = resolvePageDisplayScale(ctx);
  const polygonCategoryColorMap =
    ctx.polygonCategoryColorMap ?? categoryColorMap;
  const hasPolyHighlights =
    polyHighlightedRowIds && polyHighlightedRowIds.size > 0;
  const hlVersion = ctx.highlightVersion ?? 0;
  const {
    geoColumn,
    encoding: arrowExtension,
    isNativeGeoArrow,
    isWkbEncoded,
    isGeoJsonEncoded
  } = geometryInfo;
  const polygonConfig = viz ? getPolygonPrimitive(viz) : undefined;
  const polygonEnabled = polygonConfig?.enabled ?? true;
  const polygonFillMode = polygonConfig?.fillMode ?? FillMode.UNIQUE;
  const polygonStrokeMode = polygonConfig?.strokeMode ?? StrokeMode.UNIQUE;
  const polygonValueColumn = polygonConfig?.valueColumn;
  const polygonCategoryColumn = polygonConfig?.categoryColumn;
  const polygonStrokeValueColumn =
    polygonConfig?.strokeValueColumn ?? polygonValueColumn;
  const polygonStrokeCategoryColumn =
    polygonConfig?.strokeCategoryColumn ?? polygonCategoryColumn;
  const polygonClassification = viz
    ? (getPrimitiveClassification(viz, PrimitiveFilterType.POLYGON) ??
      viz.classification)
    : undefined;
  const polygonFillColor = resolveStyleColor(
    polygonConfig?.fillColor,
    fillColor
  );
  const polygonStrokeColor = Array.isArray(polygonConfig?.strokeColor)
    ? hexToRgb(polygonConfig.strokeColor[0] ?? '#000000')
    : typeof polygonConfig?.strokeColor === 'string'
      ? hexToRgb(polygonConfig.strokeColor)
      : strokeColor;
  const polygonFillOpacity = normalizeOpacity(
    polygonConfig?.fillOpacity,
    rawPolyFillOpacity
  );
  const polygonStrokeWidth = polygonConfig?.strokeWidth ?? strokeWidth;
  const polygonStrokeWidthPx =
    (polygonStrokeWidth / POLYGON_STROKE_WIDTH_DIVISOR) * pageDisplayScale;
  const polygonStrokeOpacity = normalizeOpacity(
    polygonConfig?.strokeOpacity,
    rawPolyStrokeOpacity
  );

  const useChoropleth =
    viz && shouldApplyChoropleth(viz, PrimitiveFilterType.POLYGON);
  const useCategoricalColor =
    viz && shouldApplyCategorical(viz, PrimitiveFilterType.POLYGON);
  const strokeDashed = polygonConfig?.strokeDashed ?? false;
  const strokeDashArray = strokeDashed
    ? resolveThematicStrokeDashArray(polygonConfig?.strokeDashedPattern)
    : ([0, 0] as [number, number]);
  const strokeCapRounded =
    strokeDashed &&
    resolveThematicStrokeCapRounded(polygonConfig?.strokeDashedPattern);
  const layerId = createThematicLayerId(DeckLayerId.POLYGON_LAYER, ctx);
  const projectedGeoJsonLayerId = `${layerId}-projected-geojson`;
  const patternProps = buildPatternProps(ctx);
  const classPatternPalette = resolveClassPatternPalette(
    polygonClassification,
    polygonFillMode
  );
  const { color: polygonMissingColor, show: showMissingPolygons } =
    resolveMissingDataRenderProps(
      polygonConfig,
      hexToRgb(DEFAULT_COLORS.missingData)
    );
  const missingDataPatternProps = buildMissingDataPatternProps(
    polygonConfig,
    showMissingPolygons
  );
  const missingDataResolvedPattern = resolveMissingDataClassPattern(
    polygonConfig?.missingData
  );
  const missingDataPatternFillRgb = missingDataResolvedPattern
    ? hexToRgb(missingDataResolvedPattern.fill)
    : polygonMissingColor;
  const densityRequested =
    polygonFillMode === FillMode.DENSITY && Boolean(viz?.density);
  const densityTable = ctx.densityTable;
  const densityGeometryInfo = ctx.densityGeometryInfo;
  const DEFAULT_PRIMITIVE_ORDER: PrimitiveFilter[] = [
    PrimitiveFilterType.POINT,
    PrimitiveFilterType.LINE,
    PrimitiveFilterType.POLYGON
  ];
  const primitiveFilters = getEnabledPrimitiveFilters(ctx.viz);
  const primitiveOrder = ctx.primitiveOrder ?? DEFAULT_PRIMITIVE_ORDER;
  const polygonPrimitiveAllowed =
    !ctx.viz || primitiveFilters.includes(PrimitiveFilterType.POLYGON);

  if (densityRequested) {
    const densityLayers =
      densityTable && densityGeometryInfo
        ? createPointLayers(densityTable, densityGeometryInfo, ctx)
        : [];
    const pointLayers = createRepresentativePointSymbolLayers(
      jsTable,
      withPrimitiveScope(ctx, PrimitiveFilterType.POINT)
    );
    const layers = orderPrimitiveLayers(
      [
        ...(polygonPrimitiveAllowed
          ? densityLayers.map((layer) => ({
              primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
              layer
            }))
          : []),
        ...pointLayers.map((layer) => ({
          primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
          layer
        }))
      ],
      primitiveOrder
    );
    const selectionOverlay = createHighlightedPolygonOverlay(
      layerId,
      jsTable,
      geoColumn,
      polyHighlightedRowIds,
      hlVersion,
      ctx
    );
    if (selectionOverlay) {
      layers.push(selectionOverlay);
    }
    return layers;
  }

  if (!isNativeGeoArrow && !isGeoJsonEncoded && !isWkbEncoded) {
    return [];
  }

  const isNativeGeoArrowPolygon =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POLYGON ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOLYGON);
  const preferProjectedGeoJsonFallback =
    Boolean(ctx.customProjection) && (isWkbEncoded || isGeoJsonEncoded);

  if (
    !preferProjectedGeoJsonFallback &&
    (isNativeGeoArrowPolygon || isNativeGeoArrow)
  ) {
    try {
      const polyData = resolvePolygonParser(ctx.customProjection)(jsTable);
      const outlineData = resolvePathParser(ctx.customProjection)(jsTable);
      const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
        ctx.splitDatasetTable ?? jsTable,
        viz,
        polygonCategoryColorMap,
        polygonCategoryColumn,
        PrimitiveFilterType.POLYGON
      );

      const choroplethAccessor =
        useChoropleth && viz
          ? createChoroplethColorAccessor(
              polygonValueColumn!,
              polygonClassification!.breaks!,
              polygonClassification!.colors!,
              polygonMissingColor,
              showMissingPolygons
            )
          : null;

      const categoricalAccessor =
        useCategoricalColor && viz
          ? createCategoricalColorAccessor(
              polygonCategoryColumn!,
              effectiveCategoryColorMap,
              polygonMissingColor,
              showMissingPolygons,
              polygonClassification?.disabledLabels ?? []
            )
          : null;
      const splitUniqueFillAccessor =
        polygonFillMode === FillMode.UNIQUE && !classPatternPalette
          ? createSplitUniqueBinaryColorAccessor(
              ctx,
              jsTable,
              jsTable,
              polygonFillColor
            )
          : null;

      const uniquePatternBaseFillAccessor =
        classPatternPalette && polygonFillMode === FillMode.UNIQUE
          ? createUniquePatternBaseFillAccessor(ctx)
          : null;

      const baseFillAccessor =
        choroplethAccessor ??
        categoricalAccessor ??
        uniquePatternBaseFillAccessor;

      const classPatternClassIndexAccessor = classPatternPalette
        ? polygonFillMode === FillMode.CLASSES
          ? createClassIndexAccessor(
              polygonValueColumn!,
              polygonClassification!.breaks!,
              classPatternPalette.length
            )
          : polygonFillMode === FillMode.CATEGORIES
            ? createCategoryIndexAccessor(
                polygonCategoryColumn!,
                polygonClassification?.labels ?? [],
                polygonClassification?.disabledLabels ?? []
              )
            : createUniqueClassPatternIndexAccessor(ctx)
        : null;

      const patternedFillAccessor =
        classPatternPalette &&
        classPatternClassIndexAccessor &&
        baseFillAccessor
          ? createPatternBackgroundFillAccessor(
              classPatternClassIndexAccessor,
              baseFillAccessor
            )
          : baseFillAccessor;

      const fillColorFn =
        hasPolyHighlights && polyHighlightedRowIds
          ? patternedFillAccessor
            ? withRowHighlightAccessor(
                patternedFillAccessor,
                polygonFillOpacity,
                HIGHLIGHT_DIMMING_FACTOR,
                polyHighlightedRowIds
              )
            : withRowHighlight(
                polygonFillColor,
                polygonFillOpacity,
                HIGHLIGHT_DIMMING_FACTOR,
                polyHighlightedRowIds
              )
          : patternedFillAccessor;

      const fillColorBinaryAttr = splitUniqueFillAccessor
        ? createPolygonFillColorAttribute(polyData, splitUniqueFillAccessor)
        : fillColorFn
          ? createPolygonFillColorAttribute(
              polyData,
              ctxRowAccessor(ctx, jsTable, fillColorFn)
            )
          : null;

      const polygonStrokeClassification = polygonConfig?.strokeClassification;
      const strokeColorsArray =
        polygonStrokeClassification?.colors &&
        polygonStrokeClassification.colors.length > 0
          ? polygonStrokeClassification.colors
          : Array.isArray(polygonConfig?.strokeColor)
            ? polygonConfig.strokeColor
            : undefined;
      const strokeChoroplethAccessor =
        polygonStrokeMode === StrokeMode.CLASSES &&
        strokeColorsArray &&
        polygonStrokeValueColumn &&
        (polygonStrokeClassification?.breaks ??
          polygonClassification?.breaks) &&
        strokeColorsArray.length > 0
          ? createChoroplethColorAccessor(
              polygonStrokeValueColumn,
              polygonStrokeClassification?.breaks ??
                polygonClassification!.breaks!,
              strokeColorsArray,
              polygonMissingColor,
              showMissingPolygons
            )
          : null;
      const strokeCategoricalAccessor =
        polygonStrokeMode === StrokeMode.CATEGORIES &&
        strokeColorsArray &&
        polygonStrokeCategoryColumn &&
        strokeColorsArray.length > 0
          ? (() => {
              const labels =
                polygonStrokeClassification?.labels ??
                polygonClassification?.labels ??
                [];
              if (labels.length === 0) return null;
              const map = new Map<string, RGBColor>();
              labels.forEach((label, i) => {
                const hex =
                  strokeColorsArray[i] ??
                  strokeColorsArray[strokeColorsArray.length - 1];
                map.set(String(label), hexToRgb(hex));
              });
              return createCategoricalColorAccessor(
                polygonStrokeCategoryColumn,
                map,
                polygonMissingColor,
                showMissingPolygons,
                polygonStrokeClassification?.disabledLabels ?? []
              );
            })()
          : null;
      const splitUniqueStrokeAccessor =
        polygonStrokeMode === StrokeMode.UNIQUE
          ? createSplitUniqueBinaryColorAccessor(
              ctx,
              jsTable,
              jsTable,
              polygonStrokeColor
            )
          : null;
      const baseStrokeAccessor =
        strokeChoroplethAccessor ?? strokeCategoricalAccessor;

      const strokeColorFn =
        hasPolyHighlights && polyHighlightedRowIds
          ? baseStrokeAccessor
            ? withRowHighlightAccessor(
                baseStrokeAccessor,
                polygonStrokeOpacity,
                HIGHLIGHT_DIMMING_FACTOR,
                polyHighlightedRowIds
              )
            : withRowHighlight(
                polygonStrokeColor,
                polygonStrokeOpacity,
                HIGHLIGHT_DIMMING_FACTOR,
                polyHighlightedRowIds
              )
          : baseStrokeAccessor;

      const strokeColorBinaryAttr = splitUniqueStrokeAccessor
        ? pathColorAttr(outlineData, splitUniqueStrokeAccessor)
        : strokeColorFn
          ? pathColorAttr(
              outlineData,
              ctxRowAccessor(ctx, jsTable, strokeColorFn)
            )
          : null;

      const layers: Layer<DeckDataRow>[] = [];

      const solidProps = createCompatibleSolidPolygonLayerProps(polyData);
      const solidBinaryData = solidProps.data as {
        attributes: Record<string, unknown>;
        khartisSourceTable?: ArrowTable;
        featureIds?: Uint32Array;
      };
      attachBinaryPickingMetadata(solidBinaryData, jsTable, polyData, ctx);
      if (fillColorBinaryAttr) {
        solidBinaryData.attributes.getFillColor = fillColorBinaryAttr;
      }

      const singleMotifFillColor: [number, number, number, number] =
        patternProps && !classPatternPalette
          ? [255, 255, 255, 255]
          : [
              polygonFillColor[0],
              polygonFillColor[1],
              polygonFillColor[2],
              255
            ];

      const fillLayer = new SolidPolygonLayer({
        id: layerId,
        ...(solidProps as unknown as Record<string, unknown>),
        ...(!fillColorBinaryAttr && {
          getFillColor: singleMotifFillColor
        }),
        opacity: hasPolyHighlights ? 1 : polygonFillOpacity,
        pickable: true,
        ...resolveHoverHighlightProps(),
        parameters: {
          depthCompare: 'always' as const,
          stencilCompare: 'always' as const
        },
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useChoropleth,
            useCategoricalColor,
            polygonValueColumn,
            polygonCategoryColumn,
            polygonClassification?.breaks,
            polygonClassification?.colors,
            polygonCategoryColorMap,
            polygonClassification?.labels,
            polygonConfig?.missingData?.color ?? DEFAULT_COLORS.missingData,
            showMissingPolygons,
            polygonFillColor,
            classPatternPalette,
            Boolean(patternProps),
            hlVersion
          ]
        }
      });

      const strokePathProps = createPathLayerProps(outlineData);
      const strokeBinaryData = strokePathProps.data as {
        attributes: Record<string, unknown>;
      };
      if (strokeColorBinaryAttr) {
        strokeBinaryData.attributes.getColor = strokeColorBinaryAttr;
      }

      let strokeLayer: Layer<DeckDataRow>;
      if (strokeDashed) {
        strokeLayer = new PathLayer({
          id: `${layerId}-stroke-dashed`,
          ...(strokePathProps as unknown as Record<string, unknown>),
          ...(!strokeColorBinaryAttr && {
            getColor: withOpacity(polygonStrokeColor, polygonStrokeOpacity)
          }),
          extensions: [DASH_EXTENSION],
          getDashArray: strokeDashArray,
          dashJustified: true,
          capRounded: strokeCapRounded,
          widthUnits: 'pixels',
          getWidth: polygonStrokeWidthPx,
          widthMinPixels: 0.5,
          pickable: false,
          ...(modelMatrix && { modelMatrix }),
          ...(beforeId && { beforeId }),
          updateTriggers: {
            getColor: [polygonStrokeColor, polygonStrokeOpacity, hlVersion],
            getDashArray: [strokeDashed, polygonConfig?.strokeDashedPattern],
            getWidth: [polygonStrokeWidth]
          }
        });
      } else {
        strokeLayer = new PathLayer({
          id: `${layerId}-stroke-solid`,
          ...(strokePathProps as unknown as Record<string, unknown>),
          ...(!strokeColorBinaryAttr && {
            getColor: withOpacity(polygonStrokeColor, polygonStrokeOpacity)
          }),
          widthUnits: 'pixels',
          getWidth: polygonStrokeWidthPx,
          widthMinPixels: 0.5,
          pickable: false,
          ...(modelMatrix && { modelMatrix }),
          ...(beforeId && { beforeId }),
          updateTriggers: {
            getColor: [polygonStrokeColor, polygonStrokeOpacity, hlVersion],
            getWidth: [polygonStrokeWidth]
          }
        });
      }

      let patternLayer: Layer<DeckDataRow> | null = null;
      if (patternProps && !classPatternPalette) {
        patternLayer = createBinaryPolygonPatternOverlayLayer(
          layerId,
          polygonClassification?.patternId,
          polyData,
          patternProps,
          ctx,
          createSplitUniqueBinaryColorAccessor(
            ctx,
            jsTable,
            jsTable,
            polygonFillColor
          ) ?? (() => [...polygonFillColor, 255]),
          undefined,
          polygonFillOpacity
        );
      }
      const classPatternLayers: Layer<DeckDataRow>[] = [];
      if (classPatternPalette && classPatternClassIndexAccessor) {
        classPatternPalette.forEach((pattern, index) => {
          const classPatternProps = createClassPatternProps(
            classPatternPalette,
            index
          );
          const classFillAccessor = createClassPatternColorAccessor(
            classPatternClassIndexAccessor,
            index,
            hexToRgb(pattern.fill)
          );
          const classLayer = createBinaryPolygonPatternOverlayLayer(
            layerId,
            `c${index}`,
            polyData,
            classPatternProps,
            ctx,
            ctxRowAccessor(ctx, jsTable, classFillAccessor),
            `pattern-c${index}`,
            polygonFillOpacity
          );
          if (classLayer) {
            classPatternLayers.push(classLayer);
          }
        });
      }
      let missingDataPatternLayer: Layer<DeckDataRow> | null = null;
      if (missingDataPatternProps) {
        missingDataPatternLayer = createBinaryPolygonPatternOverlayLayer(
          layerId,
          resolveMissingDataPatternId(polygonConfig?.missingData),
          polyData,
          missingDataPatternProps,
          ctx,
          createMissingPolygonPatternColorAccessor(
            ctx,
            jsTable,
            polygonFillMode,
            polygonValueColumn,
            polygonCategoryColumn,
            effectiveCategoryColorMap,
            missingDataPatternFillRgb
          ),
          'missing-data-pattern',
          1
        );
      }

      const pointLayers = createRepresentativePointSymbolLayers(
        jsTable,
        withPrimitiveScope(ctx, PrimitiveFilterType.POINT)
      );
      const showFill =
        polygonPrimitiveAllowed &&
        polygonFillMode !== FillMode.NONE &&
        polygonFillOpacity > 0;
      const showStroke =
        polygonPrimitiveAllowed &&
        polygonStrokeMode !== StrokeMode.NONE &&
        polygonStrokeOpacity > 0 &&
        polygonStrokeWidth > 0;
      const orderedLayers = orderPrimitiveLayers(
        [
          ...(showFill
            ? [
                {
                  primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
                  layer: fillLayer
                }
              ]
            : []),
          ...(showFill && patternLayer
            ? [
                {
                  primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
                  layer: patternLayer
                }
              ]
            : []),
          ...(showFill
            ? classPatternLayers.map((layer) => ({
                primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
                layer
              }))
            : []),
          ...(showFill && missingDataPatternLayer
            ? [
                {
                  primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
                  layer: missingDataPatternLayer
                }
              ]
            : []),
          // The outline belongs to the POLYGON primitive: tagging it LINE sent
          // it to `Number.MAX_SAFE_INTEGER` on polygon datasets, whose
          // `primitiveOrder` never contains LINE, which drew it under the fill.
          ...(showStroke
            ? [
                {
                  primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
                  layer: strokeLayer
                }
              ]
            : []),
          ...pointLayers.map((layer) => ({
            primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
            layer
          }))
        ],
        primitiveOrder
      );

      layers.push(...orderedLayers);

      const selectionOverlay = createHighlightedBinaryPolygonOverlay(
        layerId,
        jsTable,
        outlineData,
        polyHighlightedRowIds,
        hlVersion,
        ctx
      );
      if (selectionOverlay) {
        layers.push(selectionOverlay);
      }

      return layers;
    } catch (error) {
      logger.warn(
        'Failed to create binary polygon layers; falling back to GeoJSON',
        LogCategory.MAP,
        {
          error,
          flow: 'polygon_binary_geojson_fallback',
          extra: {
            layerId,
            geoColumn,
            arrowExtension,
            geometryType: geometryInfo.type,
            hasCustomProjection: Boolean(ctx.customProjection)
          }
        }
      );
    }
  }

  let geojsonData;
  try {
    const rawGeoJSON = getCachedGeoJSON(jsTable, geoColumn);

    geojsonData = rawGeoJSON
      ? getCachedProjectedGeoJSON(rawGeoJSON, ctx.customProjection)
      : rawGeoJSON;
  } catch (error) {
    logger.error(
      'Failed to read GeoJSON for polygon layer',
      LogCategory.MAP,
      error
    );
    return [];
  }
  if (!geojsonData) {
    showWarning(
      m.error_geometry_conversion_title(),
      m.error_geometry_conversion_message()
    );
    return [];
  }

  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    ctx.splitDatasetTable ?? jsTable,
    viz,
    polygonCategoryColorMap,
    polygonCategoryColumn,
    PrimitiveFilterType.POLYGON
  );

  const splitGeoJsonFillColor =
    useChoropleth && viz
      ? createSplitGeoJsonFeatureAccessor(
          ctx,
          jsTable,
          createChoroplethColorAccessor(
            polygonValueColumn!,
            polygonClassification!.breaks!,
            polygonClassification!.colors!,
            polygonMissingColor,
            showMissingPolygons
          )
        )
      : useCategoricalColor && viz
        ? createSplitGeoJsonFeatureAccessor(
            ctx,
            jsTable,
            createCategoricalColorAccessor(
              polygonCategoryColumn!,
              effectiveCategoryColorMap,
              polygonMissingColor,
              showMissingPolygons,
              polygonClassification?.disabledLabels ?? []
            )
          )
        : polygonFillMode === FillMode.UNIQUE && !classPatternPalette
          ? createSplitUniqueGeoJsonColorAccessor(
              ctx,
              jsTable,
              polygonFillColor
            )
          : null;

  const baseGeoJsonFillColor =
    splitGeoJsonFillColor ??
    (useChoropleth && viz
      ? createGeoJsonChoroplethColorAccessor(
          polygonValueColumn!,
          polygonClassification!.breaks!,
          polygonClassification!.colors!,
          polygonFillColor,
          polygonMissingColor,
          showMissingPolygons
        )
      : useCategoricalColor && viz
        ? createGeoJsonCategoricalColorAccessor(
            polygonCategoryColumn!,
            effectiveCategoryColorMap,
            polygonFillColor,
            polygonMissingColor,
            showMissingPolygons,
            polygonClassification?.disabledLabels ?? []
          )
        : classPatternPalette && polygonFillMode === FillMode.UNIQUE
          ? createGeoJsonUniquePatternBaseFillAccessor(ctx, jsTable)
          : null);

  const geoJsonClassPatternIndexAccessor = classPatternPalette
    ? polygonFillMode === FillMode.CLASSES
      ? createGeoJsonClassIndexAccessor(
          polygonValueColumn!,
          polygonClassification!.breaks!,
          classPatternPalette.length
        )
      : polygonFillMode === FillMode.CATEGORIES
        ? createGeoJsonCategoryIndexAccessor(
            polygonCategoryColumn!,
            polygonClassification?.labels ?? [],
            polygonClassification?.disabledLabels ?? []
          )
        : createGeoJsonUniqueClassPatternIndexAccessor(ctx, jsTable)
    : null;

  const patternedGeoJsonFillColor =
    classPatternPalette &&
    geoJsonClassPatternIndexAccessor &&
    baseGeoJsonFillColor
      ? createGeoJsonPatternBackgroundFillAccessor(
          geoJsonClassPatternIndexAccessor,
          baseGeoJsonFillColor
        )
      : baseGeoJsonFillColor;

  const geoJsonFillColor =
    hasPolyHighlights && polyHighlightedRowIds
      ? patternedGeoJsonFillColor
        ? withGeoJsonRowHighlightAccessor(
            patternedGeoJsonFillColor,
            polygonFillOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
        : withGeoJsonRowHighlight(
            polygonFillColor,
            polygonFillOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
      : (patternedGeoJsonFillColor ??
        (patternProps && !classPatternPalette
          ? ([255, 255, 255, 255] as [number, number, number, number])
          : ([
              polygonFillColor[0],
              polygonFillColor[1],
              polygonFillColor[2],
              255
            ] as [number, number, number, number])));
  const polygonStrokeColors = polygonConfig?.strokeClassification?.colors;
  const polygonStrokeBreaks =
    polygonConfig?.strokeClassification?.breaks ??
    polygonClassification?.breaks;
  const polygonStrokeGeoJsonColorMap = buildCategoryColorMapFromLabels(
    polygonConfig?.strokeClassification?.labels ??
      polygonClassification?.labels,
    polygonConfig?.strokeClassification?.colors
  );
  const splitGeoJsonStrokeColor =
    polygonStrokeMode === StrokeMode.CLASSES &&
    polygonStrokeValueColumn &&
    polygonStrokeBreaks &&
    polygonStrokeColors?.length
      ? createSplitGeoJsonFeatureAccessor(
          ctx,
          jsTable,
          createChoroplethColorAccessor(
            polygonStrokeValueColumn,
            polygonStrokeBreaks,
            polygonStrokeColors,
            polygonMissingColor,
            showMissingPolygons
          )
        )
      : polygonStrokeMode === StrokeMode.CATEGORIES &&
          polygonStrokeCategoryColumn &&
          polygonStrokeColors?.length
        ? createSplitGeoJsonFeatureAccessor(
            ctx,
            jsTable,
            createCategoricalColorAccessor(
              polygonStrokeCategoryColumn,
              polygonStrokeGeoJsonColorMap,
              polygonMissingColor,
              showMissingPolygons,
              polygonConfig?.strokeClassification?.disabledLabels ?? []
            )
          )
        : polygonStrokeMode === StrokeMode.UNIQUE
          ? createSplitUniqueGeoJsonColorAccessor(
              ctx,
              jsTable,
              polygonStrokeColor
            )
          : null;

  const baseGeoJsonStrokeColor = splitGeoJsonStrokeColor
    ? (feature: { properties?: Record<string, unknown> }) =>
        withOpacityPreservingAlpha(
          splitGeoJsonStrokeColor(feature),
          polygonStrokeOpacity
        ) as [number, number, number, number]
    : polygonStrokeMode === StrokeMode.CLASSES &&
        polygonStrokeValueColumn &&
        polygonStrokeBreaks &&
        polygonStrokeColors?.length
      ? (feature: { properties?: Record<string, unknown> }) =>
          withOpacityPreservingAlpha(
            createGeoJsonChoroplethColorAccessor(
              polygonStrokeValueColumn,
              polygonStrokeBreaks,
              polygonStrokeColors,
              polygonStrokeColor,
              polygonMissingColor,
              showMissingPolygons
            )(feature),
            polygonStrokeOpacity
          ) as [number, number, number, number]
      : polygonStrokeMode === StrokeMode.CATEGORIES &&
          polygonStrokeCategoryColumn &&
          polygonStrokeColors?.length
        ? (feature: { properties?: Record<string, unknown> }) =>
            withOpacityPreservingAlpha(
              createGeoJsonCategoricalColorAccessor(
                polygonStrokeCategoryColumn,
                polygonStrokeGeoJsonColorMap,
                polygonStrokeColor,
                polygonMissingColor,
                showMissingPolygons,
                polygonConfig?.strokeClassification?.disabledLabels ?? []
              )(feature),
              polygonStrokeOpacity
            ) as [number, number, number, number]
        : null;

  const showGeoJsonFill =
    polygonEnabled &&
    polygonFillMode !== FillMode.NONE &&
    polygonFillOpacity > 0;
  const showGeoJsonStroke =
    polygonEnabled &&
    polygonStrokeMode !== StrokeMode.NONE &&
    polygonStrokeOpacity > 0 &&
    polygonStrokeWidth > 0;
  const geoJsonStrokeColor = showGeoJsonStroke
    ? hasPolyHighlights && polyHighlightedRowIds
      ? baseGeoJsonStrokeColor
        ? withGeoJsonRowHighlightAccessor(
            baseGeoJsonStrokeColor,
            polygonStrokeOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
        : withGeoJsonRowHighlight(
            polygonStrokeColor,
            polygonStrokeOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds
          )
      : (baseGeoJsonStrokeColor ??
        withOpacity(polygonStrokeColor, polygonStrokeOpacity))
    : ([0, 0, 0, 0] as [number, number, number, number]);

  const patternGeojsonData =
    patternProps &&
    !classPatternPalette &&
    showGeoJsonFill &&
    geojsonData.features.length > 0
      ? filterSplitMatchedPolygonFeatures(geojsonData, ctx, jsTable)
      : null;
  const patternLayer =
    patternProps &&
    !classPatternPalette &&
    showGeoJsonFill &&
    patternGeojsonData &&
    patternGeojsonData.features.length > 0
      ? createPolygonPatternOverlayLayer(
          layerId,
          polygonClassification?.patternId,
          patternGeojsonData,
          patternProps,
          ctx,
          undefined,
          createSplitUniqueGeoJsonColorAccessor(
            ctx,
            jsTable,
            polygonFillColor
          ) ??
            (() =>
              [
                polygonFillColor[0],
                polygonFillColor[1],
                polygonFillColor[2],
                255
              ] as [number, number, number, number]),
          polygonFillOpacity
        )
      : null;
  const classPatternGeoJsonLayers: Layer<DeckDataRow>[] =
    classPatternPalette && geoJsonClassPatternIndexAccessor && showGeoJsonFill
      ? classPatternPalette
          .map((pattern, index) => {
            const classPatternProps = createClassPatternProps(
              classPatternPalette,
              index
            );
            const classGeojsonData = filterSplitMatchedPolygonFeatures(
              geojsonData,
              ctx,
              jsTable
            );
            if (classGeojsonData.features.length === 0) {
              return null;
            }
            return createPolygonPatternOverlayLayer(
              layerId,
              `c${index}`,
              classGeojsonData,
              classPatternProps,
              ctx,
              `pattern-c${index}`,
              createGeoJsonClassPatternColorAccessor(
                geoJsonClassPatternIndexAccessor,
                index,
                hexToRgb(pattern.fill)
              ),
              polygonFillOpacity
            );
          })
          .filter((layer): layer is GeoJsonLayer => layer !== null)
      : [];
  const missingDataPatternGeojson =
    missingDataPatternProps &&
    showGeoJsonFill &&
    geojsonData.features.length > 0
      ? filterMissingPolygonPatternFeatures(
          geojsonData,
          ctx,
          jsTable,
          polygonFillMode,
          polygonValueColumn,
          polygonCategoryColumn,
          effectiveCategoryColorMap
        )
      : null;
  const missingDataPatternLayer =
    missingDataPatternProps &&
    missingDataPatternGeojson &&
    missingDataPatternGeojson.features.length > 0
      ? createPolygonPatternOverlayLayer(
          layerId,
          resolveMissingDataPatternId(polygonConfig?.missingData),
          missingDataPatternGeojson,
          missingDataPatternProps,
          ctx,
          'missing-data-pattern',
          createGeoJsonPatternOverlayColorAccessor(missingDataPatternFillRgb),
          1
        )
      : null;

  const shouldSplitGeoJsonLayers = Boolean(
    (patternLayer ||
      missingDataPatternLayer ||
      classPatternGeoJsonLayers.length > 0) &&
    showGeoJsonStroke
  );

  let geoJsonLayers: Layer<DeckDataRow>[] = [];
  if (shouldSplitGeoJsonLayers) {
    geoJsonLayers = [
      new GeoJsonLayer({
        id: projectedGeoJsonLayerId,
        data: geojsonData,
        getFillColor: geoJsonFillColor,
        filled: showGeoJsonFill,
        stroked: false,
        opacity: hasPolyHighlights ? 1 : polygonFillOpacity,
        pickable: true,
        ...resolveHoverHighlightProps(),
        parameters: {
          depthCompare: 'always' as const,
          stencilCompare: 'always' as const
        },
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useChoropleth,
            useCategoricalColor,
            polygonValueColumn,
            polygonCategoryColumn,
            polygonClassification?.breaks,
            polygonClassification?.colors,
            polygonCategoryColorMap,
            polygonClassification?.labels,
            polygonConfig?.missingData?.color ?? DEFAULT_COLORS.missingData,
            showMissingPolygons,
            polygonFillColor,
            hlVersion
          ]
        },
        dataComparator: (newData, oldData) => newData === oldData
      }),
      ...(patternLayer ? [patternLayer] : []),
      ...classPatternGeoJsonLayers,
      ...(missingDataPatternLayer ? [missingDataPatternLayer] : []),
      ...(showGeoJsonStroke
        ? [
            new GeoJsonLayer({
              id: `${layerId}-stroke`,
              data: geojsonData,
              getLineColor: geoJsonStrokeColor,
              filled: false,
              stroked: true,
              extensions: strokeDashed ? [DASH_EXTENSION] : [],
              getDashArray: strokeDashArray,
              dashJustified: true,
              capRounded: strokeCapRounded,
              lineWidthUnits: 'pixels',
              lineWidthScale: polygonStrokeWidthPx,
              lineWidthMinPixels: 0.5,
              pickable: false,
              parameters: {
                depthCompare: 'always' as const,
                stencilCompare: 'always' as const
              },
              ...(modelMatrix && { modelMatrix }),
              ...(beforeId && { beforeId }),
              updateTriggers: {
                getLineColor: [
                  polygonStrokeColor,
                  polygonStrokeOpacity,
                  polygonStrokeValueColumn,
                  polygonStrokeCategoryColumn,
                  polygonConfig?.strokeMode,
                  polygonConfig?.strokeClassification?.colors,
                  polygonConfig?.strokeClassification?.breaks,
                  polygonConfig?.strokeClassification?.labels,
                  polygonConfig?.strokeClassification?.disabledLabels,
                  showGeoJsonStroke,
                  hlVersion
                ],
                getDashArray: [strokeDashed, polygonConfig?.strokeDashedPattern]
              },
              dataComparator: (newData, oldData) => newData === oldData
            })
          ]
        : [])
    ];
  } else if (showGeoJsonFill || showGeoJsonStroke) {
    geoJsonLayers = [
      new GeoJsonLayer({
        id: projectedGeoJsonLayerId,
        data: geojsonData,
        getFillColor: geoJsonFillColor,
        getLineColor: geoJsonStrokeColor,
        filled: showGeoJsonFill,
        stroked: showGeoJsonStroke,
        extensions: showGeoJsonStroke && strokeDashed ? [DASH_EXTENSION] : [],
        getDashArray: showGeoJsonStroke ? strokeDashArray : [0, 0],
        dashJustified: true,
        capRounded: showGeoJsonStroke && strokeCapRounded,
        opacity: hasPolyHighlights ? 1 : polygonFillOpacity,
        lineWidthUnits: 'pixels',
        lineWidthScale: showGeoJsonStroke ? polygonStrokeWidthPx : 0,
        lineWidthMinPixels: showGeoJsonStroke ? 0.5 : 0,
        pickable: true,
        ...resolveHoverHighlightProps(),
        parameters: {
          depthCompare: 'always' as const,
          stencilCompare: 'always' as const
        },
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            useChoropleth,
            useCategoricalColor,
            polygonValueColumn,
            polygonCategoryColumn,
            polygonClassification?.breaks,
            polygonClassification?.colors,
            polygonCategoryColorMap,
            polygonClassification?.labels,
            polygonConfig?.missingData?.color ?? DEFAULT_COLORS.missingData,
            showMissingPolygons,
            polygonFillColor,
            hlVersion
          ],
          getLineColor: [
            polygonStrokeColor,
            polygonStrokeOpacity,
            polygonStrokeValueColumn,
            polygonStrokeCategoryColumn,
            polygonConfig?.strokeMode,
            polygonConfig?.strokeClassification?.colors,
            polygonConfig?.strokeClassification?.breaks,
            polygonConfig?.strokeClassification?.labels,
            polygonConfig?.strokeClassification?.disabledLabels,
            showGeoJsonStroke,
            hlVersion
          ],
          getDashArray: [
            showGeoJsonStroke,
            strokeDashed,
            polygonConfig?.strokeDashedPattern
          ]
        },
        dataComparator: (newData, oldData) => newData === oldData
      }),
      ...(patternLayer ? [patternLayer] : []),
      ...classPatternGeoJsonLayers,
      ...(missingDataPatternLayer ? [missingDataPatternLayer] : [])
    ];
  }

  const pointLayers = createRepresentativePointSymbolLayers(
    jsTable,
    withPrimitiveScope(ctx, PrimitiveFilterType.POINT)
  );
  const layers = orderPrimitiveLayers(
    [
      ...geoJsonLayers.map((layer) => ({
        primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
        layer
      })),
      ...pointLayers.map((layer) => ({
        primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
        layer
      }))
    ],
    primitiveOrder
  );

  const selectionOverlay = createHighlightedPolygonOverlay(
    layerId,
    jsTable,
    geoColumn,
    polyHighlightedRowIds,
    hlVersion,
    ctx
  );
  if (selectionOverlay) {
    layers.push(selectionOverlay);
  }

  return layers;
}
