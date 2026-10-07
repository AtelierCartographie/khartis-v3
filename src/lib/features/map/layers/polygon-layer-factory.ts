import type { Layer } from '@deck.gl/core';
import { PathLayer, SolidPolygonLayer } from '@deck.gl/layers';
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
  resolveMissingDataRenderProps,
  withOpacity,
  withRowHighlight,
  withRowHighlightAccessor
} from './layer-helpers';
import {
  resolvePathParser,
  resolvePolygonParser
} from './layer-geometry-parsers';
import { HIGHLIGHT_DIMMING_FACTOR } from './layer-highlight.utils';
import { createThematicLayerId } from './layer-id.utils';
import {
  createHighlightedBinaryPolygonOverlay,
  createHighlightedFeatureOverlay
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
  OUT_OF_SCOPE_COLOR,
  withPrimitiveScope
} from './split-rendering-accessors';
import {
  resolveEffectiveCategoryColorMap,
  resolveStyleColor
} from './layer-color.utils';
import {
  buildMissingDataPatternProps,
  buildPatternProps,
  createBinaryPolygonPatternOverlayLayer,
  createClassPatternProps,
  resolveClassPatternPalette,
  resolveMissingDataClassPattern,
  resolveMissingDataPatternId,
  TRANSPARENT_POLYGON_PATTERN_FILL_COLOR
} from './polygon-pattern-layer.utils';
import {
  createClassPatternColorAccessor,
  createMissingPolygonPatternColorAccessor,
  createPatternBackgroundFillAccessor,
  createSplitUniqueBinaryColorAccessor,
  createUniqueClassPatternIndexAccessor,
  createUniquePatternBaseFillAccessor
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
    isWkbEncoded
  } = geometryInfo;
  const polygonConfig = viz ? getPolygonPrimitive(viz) : undefined;
  const polygonFillMode = polygonConfig?.fillMode ?? FillMode.UNIQUE;
  const polygonStrokeMode = polygonConfig?.strokeMode ?? StrokeMode.NONE;
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

  function createDensityMissingDataLayers(): Layer<DeckDataRow>[] {
    const densityValueColumn = viz?.density?.valueColumn;
    if (
      !showMissingPolygons ||
      !densityValueColumn ||
      (!isNativeGeoArrow && !isWkbEncoded)
    ) {
      return [];
    }

    const missingColorFor = (
      fillRgb: RGBColor
    ): ((featureId: number) => [number, number, number, number]) =>
      createMissingPolygonPatternColorAccessor(
        ctx,
        jsTable,
        FillMode.DENSITY,
        densityValueColumn,
        undefined,
        null,
        fillRgb
      );

    try {
      const polyData = resolvePolygonParser(ctx.customProjection)(jsTable);
      const solidProps = createCompatibleSolidPolygonLayerProps(polyData);
      const solidBinaryData = solidProps.data as {
        attributes: Record<string, unknown>;
      };
      solidBinaryData.attributes.getFillColor = createPolygonFillColorAttribute(
        polyData,
        missingColorFor(polygonMissingColor)
      );

      const fillLayer = new SolidPolygonLayer({
        id: `${layerId}-density-missing`,
        ...(solidProps as unknown as Record<string, unknown>),
        pickable: false,
        parameters: {
          depthCompare: 'always' as const,
          stencilCompare: 'always' as const
        },
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillColor: [
            densityValueColumn,
            polygonMissingColor,
            showMissingPolygons
          ]
        }
      }) as Layer<DeckDataRow>;

      const patternLayer = missingDataPatternProps
        ? createBinaryPolygonPatternOverlayLayer(
            layerId,
            resolveMissingDataPatternId(polygonConfig?.missingData),
            polyData,
            missingDataPatternProps,
            ctx,
            missingColorFor(missingDataPatternFillRgb),
            'density-missing-data-pattern',
            1
          )
        : null;

      return patternLayer ? [fillLayer, patternLayer] : [fillLayer];
    } catch (error) {
      logger.warn(
        'Failed to create density missing-data polygons',
        LogCategory.MAP,
        error
      );
      return [];
    }
  }

  if (densityRequested) {
    const densityLayers =
      densityTable && densityGeometryInfo
        ? createPointLayers(densityTable, densityGeometryInfo, ctx)
        : [];
    const pointLayers = createRepresentativePointSymbolLayers(
      jsTable,
      withPrimitiveScope(ctx, PrimitiveFilterType.POINT)
    );
    const missingDataLayers = polygonPrimitiveAllowed
      ? createDensityMissingDataLayers()
      : [];
    const layers = orderPrimitiveLayers(
      [
        // Under the dots: a row with no value produces none, which otherwise
        // reads as a zero.
        ...missingDataLayers.map((layer) => ({
          primitive: PrimitiveFilterType.POLYGON as PrimitiveFilter,
          layer
        })),
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
    const selectionOverlay = createHighlightedFeatureOverlay(
      layerId,
      jsTable,
      geometryInfo,
      polyHighlightedRowIds,
      hlVersion,
      ctx
    );
    if (selectionOverlay) {
      layers.push(selectionOverlay);
    }
    return layers;
  }

  if (!isNativeGeoArrow && !isWkbEncoded) {
    return [];
  }

  const isNativeGeoArrowPolygon =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POLYGON ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOLYGON);

  if (isNativeGeoArrowPolygon || isNativeGeoArrow) {
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
      const singleMotifFillColor: [number, number, number, number] =
        patternProps && !classPatternPalette
          ? [255, 255, 255, 255]
          : [
              polygonFillColor[0],
              polygonFillColor[1],
              polygonFillColor[2],
              255
            ];

      const splitUniqueFillAccessor =
        polygonFillMode === FillMode.UNIQUE && !classPatternPalette
          ? createSplitUniqueBinaryColorAccessor(ctx, jsTable, jsTable, [
              singleMotifFillColor[0],
              singleMotifFillColor[1],
              singleMotifFillColor[2]
            ])
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
              ctxRowAccessor(ctx, jsTable, fillColorFn, OUT_OF_SCOPE_COLOR)
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
              ctxRowAccessor(ctx, jsTable, strokeColorFn, OUT_OF_SCOPE_COLOR)
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
            ctxRowAccessor(
              ctx,
              jsTable,
              classFillAccessor,
              TRANSPARENT_POLYGON_PATTERN_FILL_COLOR
            ),
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
      logger.error('Failed to create binary polygon layers', LogCategory.MAP, {
        error,
        flow: 'polygon_binary_layers',
        extra: {
          layerId,
          geoColumn,
          arrowExtension,
          geometryType: geometryInfo.type,
          hasCustomProjection: Boolean(ctx.customProjection)
        }
      });
    }
  }

  return [];
}
