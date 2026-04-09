import type { Color, Layer } from '@deck.gl/core';
import {
  GeoJsonLayer,
  IconLayer,
  TextLayer,
  SolidPolygonLayer,
  PathLayer,
  ScatterplotLayer
} from '@deck.gl/layers';
import {
  CollisionFilterExtension,
  DataFilterExtension,
  PathStyleExtension
} from '@deck.gl/extensions';
import RotatableFillStyleExtension from './rotatable-fill-style-extension';
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
  ALL_PRIMITIVE_FILTERS,
  type VisualizationConfig,
  PrimitiveFilterType,
  ScaleType,
  VisualizationType
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  ColorMode,
  DEFAULT_COLORS,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  SizeMode,
  SymbolMode,
  ThicknessMode,
  StrokeMode
} from '$lib/features/main-toolbar/constants';
import type {
  DeckDataRow,
  GeometryInfo,
  LayerContext,
  RGBColor,
  ThematicLayer,
  YearFilterInfo
} from '../types';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import {
  getCategoricalColorMap,
  hasCompleteCategoricalColorMap,
  getColorForValue,
  getSizeForValue,
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols
} from '../utils/data-styling.utils';
import {
  createClassedSizeAccessor,
  createCategoricalColorAccessor,
  createGeoJsonClassedSizeAccessor,
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
import {
  getPatternAtlas,
  isValidPatternId,
  PATTERN_TYPE_MAP
} from './pattern-texture';
import {
  createSolidPolygonLayerProps,
  createPathLayerProps,
  createScatterplotLayerProps,
  createPolygonFillColorAttribute
} from 'geoarrow-deck-stream';
import type { BinaryPointData, ProjectionLike } from 'geoarrow-deck-stream';
import {
  parsePaths,
  parseSolidPolygons,
  parsePointData,
  parseSolidPolygonsWithProjection,
  parsePathsWithProjection,
  parsePointDataWithProjection,
  pathColorAttr,
  pathWidthAttr,
  pointColorAttr,
  pointRadiusAttr,
  rowAccessor,
  filterValueAttr,
  pointPositions,
  projectGeoJSON
} from '../utils/geoarrow-stream-bridge';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';

const HIGHLIGHT_DIMMING_FACTOR = 0.3;
const DEFAULT_TEXT_SIZE = 12;
const DEFAULT_HALO_WIDTH = 2;
const DEFAULT_TEXT_FONT = 'IBM Plex Sans, sans-serif';
const DEFAULT_TEXT_FONT_SETTINGS = { sdf: true } as const;
const HOVER_HIGHLIGHT_COLOR: [number, number, number, number] = [0, 0, 0, 80];
const DASH_EXTENSION = new PathStyleExtension({ dash: true });
const DEFAULT_DASH_ARRAY: [number, number] = [3, 2];
const DEFAULT_TEXT_MASK_PADDING: [number, number] = [3, 1];
const POINT_SYMBOL_ICON_VIEWBOX_SIZE = 64;
const DEFAULT_LABEL_COLOR = hexToRgb(DEFAULT_COLORS.label);
const DEFAULT_TEXT_COLOR = hexToRgb(DEFAULT_COLORS.text);
const LABEL_COLLISION_PRIORITY = 100;
const TEXT_COLLISION_PRIORITY = 0;
const TEXT_COLLISION_GROUP_SUFFIX = 'text-overlays';
const pointSymbolIconCache = new Map<string, string>();

interface PointIconDatum {
  position: [number, number];
  featureId: number;
}

type DoubleProportionalVisualization = VisualizationConfig & {
  modes: NonNullable<VisualizationConfig['modes']> & {
    symbol: SymbolMode.PROPORTIONAL;
    proportionalType: ProportionalType.DOUBLE;
  };
  mapping: VisualizationConfig['mapping'] & {
    sizeColumn: string;
    valueColumn: string;
  };
  symbols: NonNullable<VisualizationConfig['symbols']>;
};

function colorToCss(color: Color): string {
  const [r = 0, g = 0, b = 0, alpha = 255] = color;
  const normalizedAlpha = Math.max(0, Math.min(1, alpha / 255));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

function resolveDeckTextFontWeight(
  weight: string | number,
  italic = false
): string | number {
  return italic ? `italic ${weight}` : weight;
}

function createPointSymbolSvg(
  shape: ShapeType,
  fillColor: Color,
  strokeColor: Color,
  strokeWidth: number
): string {
  const fill = colorToCss(fillColor);
  const stroke = colorToCss(strokeColor);
  const scaledStrokeWidth = Math.max(2, strokeWidth * 4);

  let markup = '';
  switch (shape) {
    case ShapeType.SQUARE:
      markup = `<rect x="10" y="10" width="44" height="44" rx="4" ry="4" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}" />`;
      break;
    case ShapeType.TRIANGLE:
      markup = `<path d="M32 8 L56 56 H8 Z" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}" stroke-linejoin="round" />`;
      break;
    case ShapeType.POINT:
    default:
      markup = `<circle cx="32" cy="32" r="22" fill="${fill}" stroke="${stroke}" stroke-width="${scaledStrokeWidth}" />`;
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${POINT_SYMBOL_ICON_VIEWBOX_SIZE}" height="${POINT_SYMBOL_ICON_VIEWBOX_SIZE}" viewBox="0 0 ${POINT_SYMBOL_ICON_VIEWBOX_SIZE} ${POINT_SYMBOL_ICON_VIEWBOX_SIZE}">${markup}</svg>`;
}

function createPointSymbolIcon(
  shape: ShapeType,
  fillColor: Color,
  strokeColor: Color,
  strokeWidth: number
): {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  id: string;
} {
  const key = JSON.stringify({ shape, fillColor, strokeColor, strokeWidth });
  let url = pointSymbolIconCache.get(key);
  if (!url) {
    const svg = createPointSymbolSvg(
      shape,
      fillColor,
      strokeColor,
      strokeWidth
    );
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    pointSymbolIconCache.set(key, url);
  }

  return {
    url,
    width: POINT_SYMBOL_ICON_VIEWBOX_SIZE,
    height: POINT_SYMBOL_ICON_VIEWBOX_SIZE,
    anchorX: POINT_SYMBOL_ICON_VIEWBOX_SIZE / 2,
    anchorY: POINT_SYMBOL_ICON_VIEWBOX_SIZE / 2,
    id: key
  };
}

function resolveGeoJsonLayerColor(
  candidate:
    | RGBColor
    | Color
    | ((feature: { properties?: Record<string, unknown> }) => Color),
  feature: { properties?: Record<string, unknown> },
  fallbackOpacity: number
): Color {
  if (typeof candidate === 'function') {
    return candidate(feature);
  }

  return withOpacity(Array.from(candidate), fallbackOpacity);
}

function createPointIconData(data: {
  readonly length: number;
  readonly featureIds: Uint32Array;
  readonly positions: Float64Array | Float32Array;
}): PointIconDatum[] {
  const flatPositions = pointPositions(
    data as Parameters<typeof pointPositions>[0]
  );
  const output: PointIconDatum[] = new Array(data.length);

  for (let index = 0; index < data.length; index += 1) {
    output[index] = {
      position: [
        flatPositions[index * 2] ?? 0,
        flatPositions[index * 2 + 1] ?? 0
      ],
      featureId: data.featureIds[index] ?? index
    };
  }

  return output;
}

function getRepresentativePointSource(
  ctx: LayerContext
): { table: ArrowTable; geometryInfo: GeometryInfo } | null {
  const representativePointTable = ctx.representativePointTable;
  if (!representativePointTable) {
    return null;
  }

  const geometryInfo =
    ctx.representativePointGeometryInfo ??
    extractGeometryInfo(representativePointTable);
  if (!geometryInfo) {
    return null;
  }

  if (
    geometryInfo.type !== GeometryType.POINT &&
    geometryInfo.type !== GeometryType.MULTIPOINT
  ) {
    return null;
  }

  return {
    table: representativePointTable,
    geometryInfo
  };
}

function requiresRepresentativePointSource(
  geometryType: GeometryType | undefined
): boolean {
  return (
    geometryType === GeometryType.POLYGON ||
    geometryType === GeometryType.MULTIPOLYGON ||
    geometryType === GeometryType.LINESTRING ||
    geometryType === GeometryType.MULTILINESTRING ||
    geometryType === GeometryType.MULTIPOINT
  );
}

function usesDoubleProportionalSymbols(
  viz: LayerContext['viz']
): viz is DoubleProportionalVisualization {
  return (
    !!viz &&
    viz.modes?.symbol === SymbolMode.PROPORTIONAL &&
    viz.modes?.proportionalType === ProportionalType.DOUBLE &&
    !!viz.mapping.sizeColumn &&
    !!viz.mapping.valueColumn &&
    !!viz.symbols
  );
}

function createDoubleProportionalPointLayers(
  pointData: BinaryPointData,
  jsTable: ArrowTable,
  ctx: LayerContext,
  layerId: string
): Layer<DeckDataRow>[] {
  const {
    viz,
    fillColor,
    strokeColor,
    fillOpacity: rawFillOpacity,
    strokeWidth,
    strokeOpacity: rawStrokeOpacity,
    statistics,
    secondaryStatistics,
    highlightedRowIds,
    modelMatrix,
    beforeId
  } = ctx;

  if (!usesDoubleProportionalSymbols(viz)) {
    return [];
  }

  const secondaryFillColor = hexToRgb(viz.style.fillColorB ?? '#ff832b');
  const pointShape = viz.symbols.type ?? ShapeType.POINT;
  const minPointRadius = Math.max(1, viz.symbols.minSize ?? 1);
  const maxPointRadius = Math.max(
    minPointRadius,
    viz.symbols.maxSize ?? minPointRadius
  );
  const missingPointRadius = Math.max(
    1,
    viz.missingData?.size ?? minPointRadius
  );
  const showMissingPoints = viz.missingData?.show ?? true;
  const missingPointColor = hexToRgb(
    viz.missingData?.color ?? DEFAULT_COLORS.missingData
  );
  const missingPointShape = resolveMissingPointShape(viz.missingData?.shape);
  const hlVersion = ctx.highlightVersion ?? 0;
  const primaryRadiusAccessor = createProportionalSizeAccessor(
    viz.mapping.sizeColumn,
    statistics.min,
    statistics.max,
    minPointRadius,
    maxPointRadius,
    viz.symbols.sizeScale
  );
  const secondaryStats = secondaryStatistics ?? statistics;
  const secondaryRadiusAccessor = createProportionalSizeAccessor(
    viz.mapping.valueColumn,
    secondaryStats.min,
    secondaryStats.max,
    minPointRadius,
    maxPointRadius,
    viz.symbols.sizeScale
  );

  const createRadiusAccessor =
    (columnName: string, accessor: (row: DeckDataRow) => number) =>
    (row: DeckDataRow): number => {
      if (isMissingThematicValue(row[columnName])) {
        return showMissingPoints ? missingPointRadius : 0;
      }

      return accessor(row);
    };

  const createFillAccessor =
    (columnName: string, baseColor: RGBColor) =>
    (row: DeckDataRow): [number, number, number, number] => {
      const rowOpacity = resolveHighlightedOpacityForRow(
        row,
        rawFillOpacity,
        highlightedRowIds
      );

      if (isMissingThematicValue(row[columnName])) {
        return showMissingPoints
          ? toMutableRgba(withOpacity(missingPointColor, rowOpacity))
          : [0, 0, 0, 0];
      }

      return toMutableRgba(withOpacity(baseColor, rowOpacity));
    };

  const createLineAccessor =
    (columnName: string) =>
    (row: DeckDataRow): [number, number, number, number] => {
      if (isMissingThematicValue(row[columnName]) && !showMissingPoints) {
        return [0, 0, 0, 0];
      }

      return toMutableRgba(
        withOpacity(
          strokeColor,
          resolveHighlightedOpacityForRow(
            row,
            rawStrokeOpacity,
            highlightedRowIds
          )
        )
      );
    };

  const primaryFillByFeatureId = rowAccessor(
    jsTable,
    createFillAccessor(viz.mapping.sizeColumn, fillColor)
  );
  const secondaryFillByFeatureId = rowAccessor(
    jsTable,
    createFillAccessor(viz.mapping.valueColumn, secondaryFillColor)
  );
  const primaryLineByFeatureId = rowAccessor(
    jsTable,
    createLineAccessor(viz.mapping.sizeColumn)
  );
  const secondaryLineByFeatureId = rowAccessor(
    jsTable,
    createLineAccessor(viz.mapping.valueColumn)
  );
  const primaryRadiusByFeatureId = rowAccessor(
    jsTable,
    createRadiusAccessor(viz.mapping.sizeColumn, primaryRadiusAccessor)
  );
  const secondaryRadiusByFeatureId = rowAccessor(
    jsTable,
    createRadiusAccessor(viz.mapping.valueColumn, secondaryRadiusAccessor)
  );

  const createScatterLayer = (
    suffix: string,
    fillByFeatureId: (featureId: number) => [number, number, number, number],
    lineByFeatureId: (featureId: number) => [number, number, number, number],
    radiusByFeatureId: (featureId: number) => number,
    pickable: boolean,
    triggerColumn: string
  ) => {
    const scatterProps = createScatterplotLayerProps(pointData);
    const scatterBinaryData = scatterProps.data as {
      attributes: Record<string, unknown>;
      khartisSourceTable?: ArrowTable;
    };
    scatterBinaryData.khartisSourceTable = jsTable;
    scatterBinaryData.attributes.getFillColor = pointColorAttr(
      pointData,
      fillByFeatureId
    );
    scatterBinaryData.attributes.getLineColor = pointColorAttr(
      pointData,
      lineByFeatureId
    );
    scatterBinaryData.attributes.getRadius = pointRadiusAttr(
      pointData,
      radiusByFeatureId
    );

    const yearFilterProps = ctx.yearFilter
      ? buildYearFilterProps(
          pointData,
          scatterBinaryData,
          jsTable,
          ctx.yearFilter
        )
      : null;

    return new ScatterplotLayer({
      id: `${layerId}-${suffix}`,
      ...(scatterProps as unknown as Record<string, unknown>),
      stroked: true,
      opacity: 1,
      radiusScale: 1,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 3,
      pickable,
      autoHighlight: pickable,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      ...yearFilterProps,
      updateTriggers: {
        getFillColor: [
          triggerColumn,
          rawFillOpacity,
          fillColor,
          viz.style.fillColorB,
          viz.missingData?.show,
          viz.missingData?.color,
          hlVersion
        ],
        getLineColor: [
          triggerColumn,
          strokeColor,
          rawStrokeOpacity,
          viz.missingData?.show,
          hlVersion
        ],
        getRadius: [
          triggerColumn,
          statistics.min,
          statistics.max,
          secondaryStats.min,
          secondaryStats.max,
          viz.symbols?.minSize,
          viz.symbols?.maxSize,
          viz.symbols?.sizeScale,
          viz.missingData?.show,
          viz.missingData?.size
        ],
        ...(ctx.yearFilter && {
          getFilterValue: [ctx.yearFilter.column, ctx.yearFilter.value]
        })
      }
    }) as ThematicLayer;
  };

  if (pointShape !== ShapeType.POINT) {
    const iconData = createPointIconData(pointData);
    const createIconLayer = (
      suffix: string,
      fillByFeatureId: (featureId: number) => [number, number, number, number],
      lineByFeatureId: (featureId: number) => [number, number, number, number],
      radiusByFeatureId: (featureId: number) => number,
      triggerColumn: string,
      pickable: boolean
    ) =>
      new IconLayer({
        id: `${layerId}-${suffix}`,
        data: iconData,
        getPosition: (datum) => datum.position,
        getIcon: (datum) => {
          const row = jsTable.get(datum.featureId) as DeckDataRow;
          const isMissing = isMissingThematicValue(row[triggerColumn]);

          return createPointSymbolIcon(
            isMissing ? missingPointShape : pointShape,
            fillByFeatureId(datum.featureId),
            lineByFeatureId(datum.featureId),
            strokeWidth / 3
          );
        },
        getSize: (datum) => Math.max(1, radiusByFeatureId(datum.featureId) * 2),
        sizeUnits: 'pixels',
        sizeScale: 1,
        sizeMinPixels: 1,
        alphaCutoff: 0,
        billboard: true,
        pickable,
        autoHighlight: pickable,
        highlightColor: HOVER_HIGHLIGHT_COLOR,
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getIcon: [
            pointShape,
            triggerColumn,
            fillColor,
            viz.style.fillColorB,
            strokeColor,
            rawFillOpacity,
            rawStrokeOpacity,
            strokeWidth,
            viz.missingData?.show,
            viz.missingData?.color,
            viz.missingData?.shape,
            hlVersion
          ],
          getSize: [
            triggerColumn,
            statistics.min,
            statistics.max,
            secondaryStats.min,
            secondaryStats.max,
            viz.symbols?.minSize,
            viz.symbols?.maxSize,
            viz.symbols?.sizeScale,
            viz.missingData?.show,
            viz.missingData?.size
          ]
        }
      }) as ThematicLayer;

    return [
      createIconLayer(
        'double-primary',
        primaryFillByFeatureId,
        primaryLineByFeatureId,
        primaryRadiusByFeatureId,
        viz.mapping.sizeColumn,
        true
      ),
      createIconLayer(
        'double-secondary',
        secondaryFillByFeatureId,
        secondaryLineByFeatureId,
        secondaryRadiusByFeatureId,
        viz.mapping.valueColumn,
        false
      )
    ];
  }

  return [
    createScatterLayer(
      'double-primary',
      primaryFillByFeatureId,
      primaryLineByFeatureId,
      primaryRadiusByFeatureId,
      true,
      viz.mapping.sizeColumn
    ),
    createScatterLayer(
      'double-secondary',
      secondaryFillByFeatureId,
      secondaryLineByFeatureId,
      secondaryRadiusByFeatureId,
      false,
      viz.mapping.valueColumn
    )
  ];
}

function createRepresentativePointSymbolLayers(
  jsTable: ArrowTable,
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

  if (!viz) {
    return [];
  }

  const primitiveFilters = viz.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
  if (!primitiveFilters.includes(PrimitiveFilterType.POINT)) {
    return [];
  }

  const representativePointSource = getRepresentativePointSource(ctx);
  if (!representativePointSource) {
    return [];
  }

  const pointData = resolvePointParser(ctx.customProjection)(
    representativePointSource.table
  );

  const pointLayerId = createThematicLayerId(DeckLayerId.POINT_LAYER, ctx);

  if (usesDoubleProportionalSymbols(viz)) {
    return createDoubleProportionalPointLayers(
      pointData,
      jsTable,
      ctx,
      pointLayerId
    );
  }

  const hlVersion = ctx.highlightVersion ?? 0;
  const useProportionalSymbols = shouldApplyProportionalSymbols(viz);
  const useClassedSymbols =
    viz.modes?.symbol === SymbolMode.CLASSES &&
    !!viz.mapping.valueColumn &&
    !!viz.classification?.breaks &&
    viz.classification.breaks.length >= 2;
  const useCategoricalColor = shouldApplyCategorical(viz);
  const useChoropleth = shouldApplyChoropleth(viz);
  const { min: minValue, max: maxValue } = statistics;
  const pointMissingColumn = resolvePointMissingColumn(
    viz,
    useProportionalSymbols,
    useClassedSymbols,
    useCategoricalColor,
    useChoropleth
  );
  const showMissingPoints = viz.missingData?.show ?? true;
  const missingPointColor = hexToRgb(
    viz.missingData?.color ?? DEFAULT_COLORS.missingData
  );
  const pointShape = viz.symbols?.type ?? ShapeType.POINT;
  const uniquePointRadius = Math.max(1, (viz.symbols?.size ?? 10) / 2);
  const minPointRadius = Math.max(1, viz.symbols?.minSize ?? 1);
  const maxPointRadius = Math.max(
    minPointRadius,
    viz.symbols?.maxSize ?? uniquePointRadius
  );
  const missingPointRadius = Math.max(
    1,
    viz.missingData?.size ?? uniquePointRadius
  );
  const missingPointShape = resolveMissingPointShape(viz.missingData?.shape);
  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    jsTable,
    viz,
    categoryColorMap,
    viz.mapping.categoryColumn
  );
  const baseFillAccessor = useChoropleth
    ? createChoroplethColorAccessor(
        viz.mapping.valueColumn!,
        viz.classification!.breaks!,
        viz.classification!.colors!
      )
    : useCategoricalColor
      ? createCategoricalColorAccessor(
          viz.mapping.categoryColumn!,
          effectiveCategoryColorMap
        )
      : null;
  const baseRadiusAccessor = useClassedSymbols
    ? createClassedSizeAccessor(
        viz.mapping.valueColumn!,
        viz.classification!.breaks!,
        minPointRadius,
        maxPointRadius,
        viz.classification?.numClasses ?? viz.classification?.colors?.length
      )
    : useProportionalSymbols
      ? createProportionalSizeAccessor(
          viz.mapping.sizeColumn!,
          minValue,
          maxValue,
          minPointRadius,
          maxPointRadius,
          viz.symbols!.sizeScale
        )
      : null;

  const resolveFillColorForRow = (
    row: DeckDataRow
  ): [number, number, number, number] => {
    const rowOpacity = resolveHighlightedOpacityForRow(
      row,
      rawFillOpacity,
      highlightedRowIds
    );

    if (pointMissingColumn && isMissingThematicValue(row[pointMissingColumn])) {
      return showMissingPoints
        ? toMutableRgba(withOpacity(missingPointColor, rowOpacity))
        : [0, 0, 0, 0];
    }

    if (baseFillAccessor) {
      const [r, g, b] = baseFillAccessor(row);
      const alpha = Math.round(Math.min(Math.max(rowOpacity, 0), 1) * 255);
      return [r, g, b, alpha];
    }

    return toMutableRgba(withOpacity(fillColor, rowOpacity));
  };

  const resolveLineColorForRow = (
    row: DeckDataRow
  ): [number, number, number, number] => {
    if (
      pointMissingColumn &&
      isMissingThematicValue(row[pointMissingColumn]) &&
      !showMissingPoints
    ) {
      return [0, 0, 0, 0];
    }

    return toMutableRgba(
      withOpacity(
        strokeColor,
        resolveHighlightedOpacityForRow(
          row,
          rawStrokeOpacity,
          highlightedRowIds
        )
      )
    );
  };

  const resolveRadiusForRow = (row: DeckDataRow): number => {
    if (pointMissingColumn && isMissingThematicValue(row[pointMissingColumn])) {
      return showMissingPoints ? missingPointRadius : 0;
    }

    if (baseRadiusAccessor) {
      return baseRadiusAccessor(row);
    }

    return uniquePointRadius;
  };

  const fillColorByFeatureId = rowAccessor(jsTable, resolveFillColorForRow);
  const lineColorByFeatureId = rowAccessor(jsTable, resolveLineColorForRow);
  const radiusByFeatureId = rowAccessor(jsTable, resolveRadiusForRow);

  if (pointShape !== ShapeType.POINT) {
    const iconData = createPointIconData(pointData);

    return [
      new IconLayer({
        id: `${pointLayerId}-centroid-icons`,
        data: iconData,
        getPosition: (datum) => datum.position,
        getIcon: (datum) => {
          const row = jsTable.get(datum.featureId) as DeckDataRow;
          const isMissing =
            pointMissingColumn &&
            isMissingThematicValue(row[pointMissingColumn]);

          return createPointSymbolIcon(
            isMissing ? missingPointShape : pointShape,
            fillColorByFeatureId(datum.featureId),
            lineColorByFeatureId(datum.featureId),
            strokeWidth / 3
          );
        },
        getSize: (datum) => Math.max(1, radiusByFeatureId(datum.featureId) * 2),
        sizeUnits: 'pixels',
        sizeScale: 1,
        sizeMinPixels: 1,
        alphaCutoff: 0,
        billboard: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: HOVER_HIGHLIGHT_COLOR,
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getIcon: [
            pointShape,
            useChoropleth,
            viz.mapping.valueColumn,
            viz.classification?.breaks,
            viz.classification?.colors,
            useCategoricalColor,
            viz.mapping.categoryColumn,
            categoryColorMap,
            fillColor,
            strokeColor,
            rawFillOpacity,
            rawStrokeOpacity,
            strokeWidth,
            pointMissingColumn,
            viz.missingData?.show,
            viz.missingData?.color,
            viz.missingData?.size,
            viz.missingData?.shape,
            hlVersion
          ],
          getSize: [
            useProportionalSymbols,
            useClassedSymbols,
            viz.mapping.sizeColumn,
            viz.mapping.valueColumn,
            minValue,
            maxValue,
            viz.classification?.breaks,
            viz.symbols?.size,
            viz.symbols?.minSize,
            viz.symbols?.maxSize,
            viz.symbols?.sizeScale,
            pointMissingColumn,
            viz.missingData?.show,
            viz.missingData?.size
          ]
        }
      })
    ];
  }

  const scatterProps = createScatterplotLayerProps(pointData);
  const scatterBinaryData = scatterProps.data as {
    attributes: Record<string, unknown>;
    khartisSourceTable?: ArrowTable;
  };
  scatterBinaryData.khartisSourceTable = jsTable;
  scatterBinaryData.attributes.getFillColor = pointColorAttr(
    pointData,
    fillColorByFeatureId
  );
  scatterBinaryData.attributes.getLineColor = pointColorAttr(
    pointData,
    lineColorByFeatureId
  );
  scatterBinaryData.attributes.getRadius = pointRadiusAttr(
    pointData,
    radiusByFeatureId
  );

  const yearFilterProps = ctx.yearFilter
    ? buildYearFilterProps(
        pointData,
        scatterBinaryData,
        jsTable,
        ctx.yearFilter
      )
    : null;

  return [
    new ScatterplotLayer({
      id: `${pointLayerId}-centroids`,
      ...(scatterProps as unknown as Record<string, unknown>),
      stroked: true,
      opacity: 1,
      radiusScale: 1,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 3,
      pickable: true,
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      ...yearFilterProps,
      updateTriggers: {
        getFillColor: [
          useChoropleth,
          viz.mapping.valueColumn,
          viz.classification?.breaks,
          viz.classification?.colors,
          useCategoricalColor,
          viz.mapping.categoryColumn,
          categoryColorMap,
          fillColor,
          pointMissingColumn,
          viz.missingData?.show,
          viz.missingData?.color,
          hlVersion
        ],
        getLineColor: [
          strokeColor,
          rawStrokeOpacity,
          pointMissingColumn,
          viz.missingData?.show,
          hlVersion
        ],
        getRadius: [
          useProportionalSymbols,
          useClassedSymbols,
          viz.mapping.sizeColumn,
          viz.mapping.valueColumn,
          minValue,
          maxValue,
          viz.classification?.breaks,
          viz.symbols?.size,
          viz.symbols?.minSize,
          viz.symbols?.maxSize,
          viz.symbols?.sizeScale,
          pointMissingColumn,
          viz.missingData?.show,
          viz.missingData?.size
        ],
        ...(ctx.yearFilter && {
          getFilterValue: [ctx.yearFilter.column, ctx.yearFilter.value]
        })
      }
    })
  ];
}

function isMissingThematicValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'number') {
    return !Number.isFinite(value);
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  return false;
}

function resolvePointMissingColumn(
  viz: LayerContext['viz'],
  useProportionalSymbols: boolean,
  useClassedSymbols: boolean,
  useCategoricalColor: boolean,
  useChoropleth: boolean
): string | null {
  if (!viz) {
    return null;
  }

  if (useClassedSymbols || useChoropleth) {
    return viz.mapping.valueColumn ?? null;
  }

  if (useProportionalSymbols) {
    return viz.mapping.sizeColumn ?? null;
  }

  if (useCategoricalColor) {
    return viz.mapping.categoryColumn ?? null;
  }

  return null;
}

function resolveMissingPointShape(
  shape: MissingDataShape | undefined
): ShapeType {
  switch (shape) {
    case MissingDataShape.SQUARE:
      return ShapeType.SQUARE;
    case MissingDataShape.CROSS:
      return ShapeType.TRIANGLE;
    case MissingDataShape.CIRCLE:
    default:
      return ShapeType.POINT;
  }
}

function resolveHighlightedOpacityForRow(
  row: DeckDataRow,
  baseOpacity: number,
  highlightedRowIds: Set<number> | undefined
): number {
  if (!highlightedRowIds || highlightedRowIds.size === 0) {
    return baseOpacity;
  }

  const rowId = row[INTERNAL_COLUMN.ID];
  return highlightedRowIds.has(Number(rowId))
    ? baseOpacity
    : baseOpacity * HIGHLIGHT_DIMMING_FACTOR;
}

function toMutableRgba(color: Color): [number, number, number, number] {
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[3] ?? 255];
}

function resolvePolygonParser(customProjection?: ProjectionLike) {
  return customProjection
    ? (table: ArrowTable) =>
        parseSolidPolygonsWithProjection(table, customProjection)
    : parseSolidPolygons;
}

function resolvePathParser(customProjection?: ProjectionLike) {
  return customProjection
    ? (table: ArrowTable) => parsePathsWithProjection(table, customProjection)
    : parsePaths;
}

function resolvePointParser(customProjection?: ProjectionLike) {
  return customProjection
    ? (table: ArrowTable) =>
        parsePointDataWithProjection(table, customProjection)
    : parsePointData;
}

// WeakMap cache for arrowTableToGeoJSON — keyed by (table, geoColumn).
// Avoids redundant full-table walks when the same table is converted
// multiple times during a single layer-creation pass (labels, fallback, etc.).
const geoJsonConversionCache = new WeakMap<
  ArrowTable,
  Map<string, FeatureCollection | null>
>();

/**
 * WeakMap cache for createTextLayerDataFromBinary — avoids recomputing
 * centroids + label extraction when only styling/highlight changes occur.
 * Two-level keying: table → (ProjectionLike | null) → "geoType:col:col2" → result.
 * The projection reference is stable per basemap (memoized in use-map-layers.svelte.ts).
 */
const textLabelCache = new WeakMap<
  ArrowTable,
  Map<ProjectionLike | null, Map<string, TextLayerDatum[]>>
>();

function getCachedGeoJSON(
  table: ArrowTable,
  geoColumn: string
): FeatureCollection | null {
  let columnMap = geoJsonConversionCache.get(table);
  if (columnMap) {
    const cached = columnMap.get(geoColumn);
    if (cached !== undefined) return cached;
  } else {
    columnMap = new Map();
    geoJsonConversionCache.set(table, columnMap);
  }
  const result = arrowTableToGeoJSON(table, geoColumn);
  columnMap.set(geoColumn, result);
  return result;
}

/** Cached DataFilterExtension singleton — reused across all layers with year filtering */
const DATA_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 1 });
const COLLISION_FILTER_EXTENSION = new CollisionFilterExtension();

/**
 * Build DataFilterExtension props for a binary layer when yearFilter is active.
 * Injects getFilterValue binary attribute into data.attributes and returns
 * layer props (extensions, filterRange, updateTriggers).
 */
function buildYearFilterProps(
  binaryData: { readonly length: number; readonly featureIds: Uint32Array },
  dataObj: { attributes: Record<string, unknown> },
  table: ArrowTable,
  yearFilter: YearFilterInfo
): Record<string, unknown> {
  const filterAttr = filterValueAttr(binaryData, table, yearFilter.column);
  // deck.gl only recalculates binary attributes reliably when the data prop
  // changes shallowly; mutating data.attributes in place can leave the filter
  // extension with stale GPU state when a year filter is toggled on/off.
  const nextData = {
    ...dataObj,
    attributes: {
      ...dataObj.attributes,
      getFilterValue: filterAttr
    }
  };
  return {
    data: nextData,
    extensions: [DATA_FILTER_EXTENSION],
    filterRange: [yearFilter.value, yearFilter.value] as [number, number]
  };
}

function filterGeoJsonByYear<T extends Geometry>(
  geojson: FeatureCollection<T>,
  yearFilter: YearFilterInfo | undefined
): FeatureCollection<T> {
  if (!yearFilter) {
    return geojson;
  }

  const expectedYear = parseYearTextValue(yearFilter.value);
  if (expectedYear === null) {
    return geojson;
  }

  return {
    ...geojson,
    features: geojson.features.filter((feature) => {
      const rawValue = feature.properties?.[yearFilter.column];
      return parseYearTextValue(rawValue) === expectedYear;
    })
  };
}

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

  return {
    extensions: [getFillStyleExtension()],
    fillPatternAtlas: atlas,
    fillPatternMapping: mapping,
    fillPatternMask: true,
    getFillPattern: () => patternId,
    getFillPatternScale: 200,
    getFillPatternRotation: PATTERN_TYPE_MAP[patternId]?.angle ?? 0
  };
}

export type { LayerContext };

function resolveThematicScopeId(ctx: LayerContext): string {
  return ctx.viz?.id ?? ctx.datasetId ?? 'default';
}

function resolveTextCollisionGroup(ctx: LayerContext): string {
  const datasetScope = ctx.datasetId || resolveThematicScopeId(ctx);
  return `${datasetScope}-${TEXT_COLLISION_GROUP_SUFFIX}`;
}

function createTextCollisionProps(
  ctx: LayerContext,
  enabled: boolean,
  priority: number
): Pick<
  TextLayerWithCollisionProps,
  'extensions' | 'collisionEnabled' | 'collisionGroup' | 'getCollisionPriority'
> {
  return {
    extensions: [COLLISION_FILTER_EXTENSION],
    collisionEnabled: enabled,
    collisionGroup: resolveTextCollisionGroup(ctx),
    getCollisionPriority: () => priority
  };
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
  primaryText: string | null;
  secondaryText: string | null;
  isMissingData: boolean;
  rowIndex: number;
}

type TextLayerWithCollisionProps = ConstructorParameters<
  typeof TextLayer<TextLayerDatum>
>[0] & {
  collisionEnabled?: boolean;
  collisionGroup?: string;
  getCollisionPriority?: (datum: TextLayerDatum) => number;
};

function normalizeOpacity(opacity: number | undefined, fallback = 1): number {
  if (typeof opacity !== 'number') return fallback;
  const normalized = opacity > 1 ? opacity / 100 : opacity;
  return Math.min(Math.max(normalized, 0), 1);
}

function resolveEffectiveCategoryColorMap(
  jsTable: ArrowTable,
  viz: LayerContext['viz'],
  categoryColorMap: Map<string, RGBColor> | null | undefined,
  categoryColumn: string | undefined
): Map<string, RGBColor> | null {
  if (!viz || !categoryColumn || !viz.classification?.colors?.length) {
    return categoryColorMap ?? null;
  }

  const storedLabels =
    viz.classification.labels
      ?.map((label) => toTextValue(label))
      .filter((label): label is string => label !== null) ?? [];
  if (storedLabels.length > 0) {
    if (hasCompleteCategoricalColorMap(storedLabels, categoryColorMap)) {
      return categoryColorMap ?? null;
    }

    return getCategoricalColorMap(storedLabels, viz.classification.colors);
  }

  const categoryVector = jsTable.getChild(categoryColumn);
  if (!categoryVector) {
    return categoryColorMap ?? null;
  }

  const categories = new Set<string>();
  for (let rowIndex = 0; rowIndex < jsTable.numRows; rowIndex += 1) {
    const value = toTextValue(categoryVector.get(rowIndex));
    if (value) {
      categories.add(value);
    }
  }

  if (categories.size === 0) {
    return categoryColorMap ?? null;
  }

  const categoryList = [...categories];
  if (hasCompleteCategoricalColorMap(categoryList, categoryColorMap)) {
    return categoryColorMap ?? null;
  }

  return getCategoricalColorMap(categoryList, viz.classification.colors);
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

function resolveVariableTextSizeBounds(baseSize: number): {
  minSize: number;
  maxSize: number;
} {
  const clampedBaseSize = Math.min(Math.max(baseSize, 8), 32);
  const minSize = Math.max(8, Math.round(clampedBaseSize * 0.75));
  const maxSize = Math.min(32, Math.round(clampedBaseSize * 1.75));

  return {
    minSize: Math.min(minSize, maxSize),
    maxSize
  };
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

function parseYearTextValue(value: unknown): number | null {
  if (typeof value === 'bigint') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numericValue = Number.parseFloat(trimmed);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}

function resolveMissingTextLabel(label: string | undefined): string {
  const normalizedLabel = label?.trim();
  return normalizedLabel && normalizedLabel.length > 0 ? normalizedLabel : '•';
}

function resolveTextDatumText(
  datum: TextLayerDatum,
  missingTextLabel: string
): string {
  if (datum.isMissingData || !datum.primaryText) {
    return missingTextLabel;
  }

  return datum.secondaryText
    ? `${datum.primaryText}\n${datum.secondaryText}`
    : datum.primaryText;
}

function filterTextLayerDataByYear(
  textData: TextLayerDatum[],
  table: ArrowTable,
  yearFilter: YearFilterInfo | undefined
): TextLayerDatum[] {
  if (!yearFilter) {
    return textData;
  }

  const yearVector = table.getChild(yearFilter.column);
  const expectedYear = parseYearTextValue(yearFilter.value);
  if (!yearVector || expectedYear === null) {
    return textData;
  }

  return textData.filter((datum) => {
    const currentYear = parseYearTextValue(yearVector.get(datum.rowIndex));
    return currentYear === expectedYear;
  });
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

  for (const [rowIndex, feature] of geojson.features.entries()) {
    const primaryText = toTextValue(feature.properties?.[primaryColumn]);
    const position = getGeometryAnchor(feature.geometry);
    if (!position) {
      continue;
    }

    const isMissingData = primaryText === null;
    const secondaryText =
      !isMissingData && secondaryColumn
        ? toTextValue(feature.properties?.[secondaryColumn])
        : null;

    output.push({
      position,
      primaryText,
      secondaryText,
      isMissingData,
      rowIndex
    });
  }

  return output;
}

/**
 * Create TextLayerDatum[] from binary point geometry data + Arrow column values.
 * Used both for raw POINT tables and DuckDB-derived representative point tables.
 */
function createTextLayerDataFromBinary(
  table: ArrowTable,
  geoInfo: GeometryInfo,
  primaryColumn: string,
  secondaryColumn?: string,
  customProjection?: ProjectionLike
): TextLayerDatum[] {
  // Check text label cache — centroids + label text are stable for the same
  // table + columns + projection. Uses projection reference as key (stable
  // per basemap thanks to memoization in use-map-layers.svelte.ts).
  const projKey = customProjection ?? null;
  const labelCacheKey = `${geoInfo.type}:${primaryColumn}:${secondaryColumn ?? ''}`;
  const tableMap = textLabelCache.get(table);
  if (tableMap) {
    const projMap = tableMap.get(projKey);
    if (projMap) {
      const cached = projMap.get(labelCacheKey);
      if (cached) return cached;
    }
  }

  const geoType = geoInfo.type;
  if (geoType !== GeometryType.POINT && geoType !== GeometryType.MULTIPOINT) {
    return [];
  }

  const pointData = resolvePointParser(customProjection)(table);
  const centroids = pointPositions(pointData);
  const featureIds = pointData.featureIds;

  const primaryVector = table.getChild(primaryColumn);
  if (!primaryVector) return [];
  const secondaryVector = secondaryColumn
    ? table.getChild(secondaryColumn)
    : null;

  const output: TextLayerDatum[] = [];
  const numFeatures = centroids.length / 2;
  const seen = new Set<number>();

  for (let i = 0; i < numFeatures; i++) {
    const fid = featureIds[i];
    // Deduplicate: multi-geometry features share the same featureId
    if (seen.has(fid)) continue;
    seen.add(fid);

    const primaryText = toTextValue(primaryVector.get(fid));
    const x = centroids[i * 2];
    const y = centroids[i * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const isMissingData = primaryText === null;
    const secondaryText =
      !isMissingData && secondaryVector
        ? toTextValue(secondaryVector.get(fid))
        : null;

    output.push({
      position: [x, y],
      primaryText,
      secondaryText,
      isMissingData,
      rowIndex: fid
    });
  }

  // Store in cache (table → projection → labelKey → result)
  let tMap = textLabelCache.get(table);
  if (!tMap) {
    tMap = new Map();
    textLabelCache.set(table, tMap);
  }
  let pMap = tMap.get(projKey);
  if (!pMap) {
    pMap = new Map();
    tMap.set(projKey, pMap);
  }
  pMap.set(labelCacheKey, output);

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
  const colorMode = viz.modes?.color ?? ColorMode.UNIQUE;
  const sizeMode = viz.modes?.size ?? SizeMode.FIXED;
  const shouldRenderLabelLayer =
    labelOpacity > 0 && colorMode !== ColorMode.NONE;
  const shouldRenderTextLayer = textOpacity > 0 && colorMode !== ColorMode.NONE;

  if (!shouldRenderLabelLayer && !shouldRenderTextLayer) {
    return [];
  }

  const isNativeGeoArrow =
    geometryInfo.isNativeGeoArrow ||
    (geometryInfo.encoding && geometryInfo.encoding.startsWith('geoarrow.'));
  let textLayerData: TextLayerDatum[] | null = null;
  let textLayerDataWithSecondary: TextLayerDatum[] | null = null;
  const representativePointSource = getRepresentativePointSource(ctx);
  const textPointSource =
    representativePointSource ??
    (geometryInfo.type === GeometryType.POINT
      ? {
          table: jsTable,
          geometryInfo
        }
      : null);

  if (textPointSource) {
    try {
      textLayerData = createTextLayerDataFromBinary(
        textPointSource.table,
        textPointSource.geometryInfo,
        viz.mapping.labelColumn,
        undefined,
        ctx.customProjection
      );
      if (viz.mapping.secondaryLabelColumn) {
        textLayerDataWithSecondary = createTextLayerDataFromBinary(
          textPointSource.table,
          textPointSource.geometryInfo,
          viz.mapping.labelColumn,
          viz.mapping.secondaryLabelColumn,
          ctx.customProjection
        );
      }
    } catch {
      textLayerData = null;
      textLayerDataWithSecondary = null;
    }
  }

  if (
    !textLayerData &&
    isNativeGeoArrow &&
    requiresRepresentativePointSource(geometryInfo.type)
  ) {
    return [];
  }

  // Fallback: GeoJSON conversion (for WKB/GeoJSON-encoded data, or if binary failed)
  if (!textLayerData) {
    let geojsonData: FeatureCollection | null;
    try {
      geojsonData = getCachedGeoJSON(jsTable, geometryInfo.geoColumn);
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
    if (!geojsonData) return [];
    textLayerData = createTextLayerData(geojsonData, viz.mapping.labelColumn);
    if (viz.mapping.secondaryLabelColumn) {
      textLayerDataWithSecondary = createTextLayerData(
        geojsonData,
        viz.mapping.labelColumn,
        viz.mapping.secondaryLabelColumn
      );
    }
  }

  const layers: ThematicLayer[] = [];
  const labelColor = resolveStyleColor(
    viz.style.labelColor,
    DEFAULT_LABEL_COLOR
  );
  const textColor = resolveStyleColor(viz.style.textColor, DEFAULT_TEXT_COLOR);
  const missingTextColor = resolveStyleColor(
    viz.missingData?.color,
    hexToRgb(DEFAULT_COLORS.missingData)
  );
  const missingTextLabel = resolveMissingTextLabel(viz.missingData?.label);
  const labelBaseSize = viz.style.labelSize ?? DEFAULT_TEXT_SIZE;
  const textBaseSize = viz.style.textSize ?? DEFAULT_TEXT_SIZE;
  const variableTextSizeColumn = viz.mapping.sizeColumn;
  const variableTextSizeVector = variableTextSizeColumn
    ? jsTable.getChild(variableTextSizeColumn)
    : null;
  const canApplyVariableTextSize =
    sizeMode === SizeMode.PROPORTIONAL &&
    !!variableTextSizeColumn &&
    !!variableTextSizeVector;
  const { minSize: minLabelSize, maxSize: maxLabelSize } =
    resolveVariableTextSizeBounds(labelBaseSize);
  const { minSize: minTextSize, maxSize: maxTextSize } =
    resolveVariableTextSizeBounds(textBaseSize);
  const labelValueVector = jsTable.getChild(viz.mapping.labelColumn);
  const categoryVector = viz.mapping.categoryColumn
    ? jsTable.getChild(viz.mapping.categoryColumn)
    : null;
  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    jsTable,
    viz,
    ctx.categoryColorMap,
    viz.mapping.categoryColumn
  );

  const createChoroplethTextColorAccessor = (
    vector: ReturnType<ArrowTable['getChild']>,
    breaks: number[] | undefined,
    colors: string[] | undefined,
    fallback: RGBColor,
    opacity: number
  ) => {
    if (!vector || !breaks?.length || !colors?.length) {
      return withOpacity(fallback, opacity);
    }

    return (datum: TextLayerDatum): Color => {
      const rawValue = vector.get(datum.rowIndex);
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return withOpacity(fallback, opacity);
      }

      const rgb = getColorForValue(numericValue, breaks, colors);
      return withOpacity(rgb, opacity);
    };
  };

  const createCategoricalTextColorAccessor = (
    vector: ReturnType<ArrowTable['getChild']>,
    fallback: RGBColor,
    opacity: number
  ) => {
    if (!vector || !effectiveCategoryColorMap?.size) {
      return withOpacity(fallback, opacity);
    }

    return (datum: TextLayerDatum): Color => {
      const category = toTextValue(vector.get(datum.rowIndex));
      const rgb = category
        ? (effectiveCategoryColorMap.get(category) ?? fallback)
        : fallback;
      return withOpacity(rgb, opacity);
    };
  };

  const createTextSizeAccessor = (defaultSize: number) => {
    if (!canApplyVariableTextSize || !variableTextSizeVector) {
      return defaultSize;
    }

    const { minSize, maxSize } =
      defaultSize === labelBaseSize
        ? { minSize: minLabelSize, maxSize: maxLabelSize }
        : { minSize: minTextSize, maxSize: maxTextSize };

    return (datum: TextLayerDatum): number => {
      const rawValue = variableTextSizeVector.get(datum.rowIndex);
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);

      if (!Number.isFinite(numericValue)) {
        return defaultSize;
      }

      return getSizeForValue(
        numericValue,
        ctx.statistics.min,
        ctx.statistics.max,
        minSize,
        maxSize,
        ScaleType.SQRT
      );
    };
  };

  const labelSizeAccessor = createTextSizeAccessor(labelBaseSize);
  const textSizeAccessor = createTextSizeAccessor(textBaseSize);

  if (shouldRenderLabelLayer) {
    const labelData = filterTextLayerDataByYear(
      textLayerData.filter((datum) => !datum.isMissingData),
      jsTable,
      ctx.yearFilter
    );
    if (labelData.length > 0) {
      const labelLayerId = createThematicLayerId(DeckLayerId.LABEL_LAYER, ctx);
      const labelColorAccessor =
        colorMode === ColorMode.CLASSES
          ? createChoroplethTextColorAccessor(
              labelValueVector,
              viz.classification?.breaks,
              viz.classification?.colors,
              labelColor,
              labelOpacity
            )
          : colorMode === ColorMode.CATEGORIES
            ? createCategoricalTextColorAccessor(
                categoryVector,
                labelColor,
                labelOpacity
              )
            : withOpacity(labelColor, labelOpacity);

      const labelLayerProps: TextLayerWithCollisionProps = {
        id: labelLayerId,
        data: labelData,
        getPosition: (d) => d.position,
        getText: (d) => resolveTextDatumText(d, missingTextLabel),
        getColor: labelColorAccessor,
        getSize: labelSizeAccessor,
        sizeUnits: 'pixels',
        getTextAnchor: resolveTextAnchor(viz.style.labelAlign),
        getAlignmentBaseline: 'center',
        fontFamily: DEFAULT_TEXT_FONT,
        fontWeight: resolveDeckTextFontWeight('400'),
        characterSet: 'auto',
        fontSettings: DEFAULT_TEXT_FONT_SETTINGS,
        outlineColor: withOpacity(
          resolveStyleColor(viz.style.labelHaloColor, [255, 255, 255]),
          1
        ),
        outlineWidth: viz.style.labelHalo
          ? (viz.style.labelHaloWidth ?? DEFAULT_HALO_WIDTH)
          : 0,
        background: viz.style.labelDxpMasking ?? false,
        getBackgroundColor: withOpacity(
          resolveStyleColor(viz.style.labelHaloColor, [255, 255, 255]),
          1
        ),
        getBorderWidth: 0,
        backgroundPadding: DEFAULT_TEXT_MASK_PADDING,
        backgroundBorderRadius: 2,
        ...createTextCollisionProps(
          ctx,
          viz.style.labelCollisionDetection ?? true,
          LABEL_COLLISION_PRIORITY
        ),
        billboard: true,
        pickable: false,
        ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
        ...(ctx.beforeId && { beforeId: ctx.beforeId }),
        updateTriggers: {
          getText: [viz.mapping.labelColumn],
          getColor: [
            colorMode,
            viz.mapping.labelColumn,
            viz.mapping.categoryColumn,
            viz.classification?.breaks,
            viz.classification?.colors,
            viz.classification?.labels,
            viz.style.labelColor,
            labelOpacity
          ],
          getSize: [
            viz.style.labelSize,
            sizeMode,
            variableTextSizeColumn,
            ctx.statistics.min,
            ctx.statistics.max
          ],
          getTextAnchor: [viz.style.labelAlign],
          outlineColor: [viz.style.labelHaloColor],
          outlineWidth: [viz.style.labelHalo, viz.style.labelHaloWidth],
          getBackgroundColor: [
            viz.style.labelDxpMasking,
            viz.style.labelHaloColor
          ]
        }
      };

      layers.push(
        new TextLayer<TextLayerDatum>(labelLayerProps) as ThematicLayer
      );
    }
  }

  if (shouldRenderTextLayer) {
    const textData = filterTextLayerDataByYear(
      (textLayerDataWithSecondary ?? textLayerData).filter(
        (datum) => !datum.isMissingData || (viz.missingData?.show ?? true)
      ),
      jsTable,
      ctx.yearFilter
    );
    if (textData.length > 0) {
      const textLayerId = createThematicLayerId(DeckLayerId.TEXT_LAYER, ctx);
      const baseTextColorAccessor =
        colorMode === ColorMode.CLASSES
          ? createChoroplethTextColorAccessor(
              labelValueVector,
              viz.classification?.breaks,
              viz.classification?.colors,
              textColor,
              textOpacity
            )
          : colorMode === ColorMode.CATEGORIES
            ? createCategoricalTextColorAccessor(
                categoryVector,
                textColor,
                textOpacity
              )
            : withOpacity(textColor, textOpacity);
      const textColorAccessor = (datum: TextLayerDatum): Color => {
        if (datum.isMissingData) {
          return withOpacity(missingTextColor, textOpacity);
        }

        return typeof baseTextColorAccessor === 'function'
          ? baseTextColorAccessor(datum)
          : baseTextColorAccessor;
      };

      layers.push(
        new TextLayer<TextLayerDatum>({
          id: textLayerId,
          data: textData,
          getPosition: (d) => d.position,
          getText: (d) => resolveTextDatumText(d, missingTextLabel),
          getColor: textColorAccessor,
          getSize: textSizeAccessor,
          sizeUnits: 'pixels',
          getTextAnchor: resolveTextAnchor(viz.style.textAlign),
          getAlignmentBaseline: 'center',
          fontFamily: DEFAULT_TEXT_FONT,
          fontWeight: resolveDeckTextFontWeight(
            viz.style.textBold ? '700' : '400',
            viz.style.textItalic
          ),
          characterSet: 'auto',
          fontSettings: DEFAULT_TEXT_FONT_SETTINGS,
          outlineColor: withOpacity(
            resolveStyleColor(viz.style.textHaloColor, [255, 255, 255]),
            1
          ),
          outlineWidth: viz.style.textHalo
            ? (viz.style.textHaloWidth ?? DEFAULT_HALO_WIDTH)
            : 0,
          background: viz.style.textDxpMasking ?? false,
          getBackgroundColor: withOpacity(
            resolveStyleColor(viz.style.textHaloColor, [255, 255, 255]),
            1
          ),
          getBorderWidth: 0,
          backgroundPadding: DEFAULT_TEXT_MASK_PADDING,
          backgroundBorderRadius: 2,
          ...createTextCollisionProps(
            ctx,
            viz.style.textCollisionDetection ?? true,
            TEXT_COLLISION_PRIORITY
          ),
          billboard: true,
          pickable: false,
          ...(ctx.modelMatrix && { modelMatrix: ctx.modelMatrix }),
          ...(ctx.beforeId && { beforeId: ctx.beforeId }),
          updateTriggers: {
            getText: [
              viz.mapping.labelColumn,
              viz.mapping.secondaryLabelColumn,
              viz.missingData?.show,
              viz.missingData?.label
            ],
            getColor: [
              colorMode,
              viz.mapping.labelColumn,
              viz.mapping.categoryColumn,
              viz.classification?.breaks,
              viz.classification?.colors,
              viz.classification?.labels,
              viz.style.textColor,
              textOpacity,
              viz.missingData?.color
            ],
            getSize: [
              viz.style.textSize,
              sizeMode,
              variableTextSizeColumn,
              ctx.statistics.min,
              ctx.statistics.max
            ],
            getTextAnchor: [viz.style.textAlign],
            outlineColor: [viz.style.textHaloColor],
            outlineWidth: [viz.style.textHalo, viz.style.textHaloWidth],
            getBackgroundColor: [
              viz.style.textDxpMasking,
              viz.style.textHaloColor
            ]
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
  const hlVersion = ctx.highlightVersion ?? 0;
  const { geoColumn, isNativeGeoArrow, isWkbEncoded, isGeoJsonEncoded } =
    geometryInfo;
  const arrowExtension = geometryInfo.encoding;

  const useProportionalSymbols = viz && shouldApplyProportionalSymbols(viz);
  const useClassedSymbols =
    viz?.modes?.symbol === SymbolMode.CLASSES &&
    !!viz.mapping.valueColumn &&
    !!viz.classification?.breaks &&
    viz.classification.breaks.length >= 2;
  const usesVariablePointSize = useProportionalSymbols || useClassedSymbols;
  const useCategoricalColor = viz && shouldApplyCategorical(viz);
  const useChoropleth = viz && shouldApplyChoropleth(viz);
  const { min: minValue, max: maxValue } = statistics;
  const pointMissingColumn = resolvePointMissingColumn(
    viz,
    Boolean(useProportionalSymbols),
    Boolean(useClassedSymbols),
    Boolean(useCategoricalColor),
    Boolean(useChoropleth)
  );
  const showMissingPoints = viz?.missingData?.show ?? true;
  const missingPointColor = hexToRgb(
    viz?.missingData?.color ?? DEFAULT_COLORS.missingData
  );

  const layerId = createThematicLayerId(DeckLayerId.POINT_LAYER, ctx);
  const pointShape = viz?.symbols?.type ?? ShapeType.POINT;
  const uniquePointRadius = Math.max(1, (viz?.symbols?.size ?? 10) / 2);
  const minPointRadius = Math.max(1, viz?.symbols?.minSize ?? 1);
  const maxPointRadius = Math.max(
    minPointRadius,
    viz?.symbols?.maxSize ?? uniquePointRadius
  );
  const missingPointRadius = Math.max(
    1,
    viz?.missingData?.size ?? uniquePointRadius
  );
  const missingPointShape = resolveMissingPointShape(viz?.missingData?.shape);

  const isNativeGeoArrowPoint =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_POINT ||
      arrowExtension === ArrowExtension.GEOARROW_MULTIPOINT);

  if (geometryInfo.type === GeometryType.MULTIPOINT) {
    return createRepresentativePointSymbolLayers(jsTable, ctx);
  }

  const shouldUseGeoJsonPointLayer =
    pointShape !== ShapeType.POINT ||
    (!isNativeGeoArrowPoint &&
      !isNativeGeoArrow &&
      (isWkbEncoded || isGeoJsonEncoded));

  // GeoJSON fallback only for actual GeoJSON strings or legacy ogc.wkb without
  // geoarrow-deck-stream support. geoarrow.wkb goes through the binary path
  // (isNativeGeoArrow = true) since geoarrow-deck-stream handles WKB natively.
  if (shouldUseGeoJsonPointLayer) {
    let geojsonData;
    try {
      const rawGeoJSON = getCachedGeoJSON(jsTable, geoColumn);
      geojsonData =
        rawGeoJSON && ctx.customProjection
          ? projectGeoJSON(rawGeoJSON, ctx.customProjection)
          : rawGeoJSON;
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
    const filteredGeoJsonData = filterGeoJsonByYear(
      geojsonData,
      ctx.yearFilter
    );

    const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
      jsTable,
      viz,
      categoryColorMap,
      viz?.mapping.categoryColumn
    );

    const baseFillColor =
      useChoropleth && viz
        ? createGeoJsonChoroplethColorAccessor(
            viz.mapping.valueColumn!,
            viz.classification!.breaks!,
            viz.classification!.colors!,
            fillColor
          )
        : useCategoricalColor && viz
          ? createGeoJsonCategoricalColorAccessor(
              viz.mapping.categoryColumn!,
              effectiveCategoryColorMap,
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
      useClassedSymbols && viz
        ? createGeoJsonClassedSizeAccessor(
            viz.mapping.valueColumn!,
            viz.classification!.breaks!,
            minPointRadius,
            maxPointRadius,
            viz.classification?.numClasses ??
              viz.classification?.colors?.length,
            uniquePointRadius
          )
        : useProportionalSymbols && viz
          ? createGeoJsonProportionalSizeAccessor(
              viz.mapping.sizeColumn!,
              minValue,
              maxValue,
              minPointRadius,
              maxPointRadius,
              viz.symbols!.sizeScale,
              uniquePointRadius
            )
          : uniquePointRadius;
    const isMissingGeoJsonPoint = (feature: {
      properties?: Record<string, unknown>;
    }): boolean =>
      pointMissingColumn
        ? isMissingThematicValue(feature.properties?.[pointMissingColumn])
        : false;

    if (pointShape !== ShapeType.POINT) {
      return [
        new GeoJsonLayer({
          id: layerId,
          data: filteredGeoJsonData,
          pointType: 'icon',
          getIcon: (feature: { properties?: Record<string, unknown> }) =>
            createPointSymbolIcon(
              isMissingGeoJsonPoint(feature) ? missingPointShape : pointShape,
              isMissingGeoJsonPoint(feature)
                ? withOpacity(
                    missingPointColor,
                    hasHighlights ? 1 : rawFillOpacity
                  )
                : resolveGeoJsonLayerColor(
                    geoJsonFillColor,
                    feature,
                    hasHighlights ? 1 : rawFillOpacity
                  ),
              isMissingGeoJsonPoint(feature) && !showMissingPoints
                ? [0, 0, 0, 0]
                : resolveGeoJsonLayerColor(
                    geoJsonLineColor,
                    feature,
                    rawStrokeOpacity
                  ),
              strokeWidth / 3
            ),
          getIconSize: (feature) => {
            if (isMissingGeoJsonPoint(feature)) {
              return showMissingPoints
                ? Math.max(1, missingPointRadius * 2)
                : 0;
            }
            const radius =
              typeof geoJsonRadius === 'function'
                ? geoJsonRadius(feature)
                : geoJsonRadius;
            return Math.max(1, radius * 2);
          },
          iconSizeUnits: 'pixels',
          iconSizeScale: 1,
          iconSizeMinPixels: 1,
          iconBillboard: true,
          iconAlphaCutoff: 0,
          pickable: true,
          autoHighlight: true,
          highlightColor: HOVER_HIGHLIGHT_COLOR,
          ...(modelMatrix && { modelMatrix }),
          ...(beforeId && { beforeId }),
          updateTriggers: {
            getIcon: [
              pointShape,
              useChoropleth,
              viz?.mapping.valueColumn,
              viz?.classification?.breaks,
              viz?.classification?.colors,
              useCategoricalColor,
              viz?.mapping.categoryColumn,
              categoryColorMap,
              viz?.classification?.labels,
              fillColor,
              strokeColor,
              rawFillOpacity,
              rawStrokeOpacity,
              strokeWidth,
              pointMissingColumn,
              viz?.missingData?.show,
              viz?.missingData?.color,
              viz?.missingData?.size,
              viz?.missingData?.shape,
              hlVersion
            ],
            getIconSize: [
              usesVariablePointSize,
              viz?.mapping.sizeColumn,
              viz?.mapping.valueColumn,
              minValue,
              maxValue,
              viz?.classification?.breaks,
              viz?.symbols?.size,
              viz?.symbols?.minSize,
              viz?.symbols?.maxSize,
              viz?.symbols?.sizeScale,
              pointMissingColumn,
              viz?.missingData?.show,
              viz?.missingData?.size
            ]
          }
        }) as ThematicLayer
      ];
    }

    return [
      new GeoJsonLayer({
        id: layerId,
        data: filteredGeoJsonData,
        pointType: 'circle',
        filled: true,
        stroked: true,
        getFillColor: (feature: { properties?: Record<string, unknown> }) => {
          if (isMissingGeoJsonPoint(feature)) {
            return showMissingPoints
              ? withOpacity(
                  missingPointColor,
                  hasHighlights ? 1 : rawFillOpacity
                )
              : [0, 0, 0, 0];
          }

          return typeof geoJsonFillColor === 'function'
            ? geoJsonFillColor(feature)
            : geoJsonFillColor;
        },
        getLineColor: (feature: { properties?: Record<string, unknown> }) => {
          if (isMissingGeoJsonPoint(feature) && !showMissingPoints) {
            return [0, 0, 0, 0];
          }

          return typeof geoJsonLineColor === 'function'
            ? geoJsonLineColor(feature)
            : geoJsonLineColor;
        },
        getPointRadius: (feature: { properties?: Record<string, unknown> }) => {
          if (isMissingGeoJsonPoint(feature)) {
            return showMissingPoints ? missingPointRadius : 0;
          }

          return typeof geoJsonRadius === 'function'
            ? geoJsonRadius(feature)
            : geoJsonRadius;
        },
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
            useChoropleth,
            viz?.mapping.valueColumn,
            viz?.classification?.breaks,
            viz?.classification?.colors,
            useCategoricalColor,
            viz?.mapping.categoryColumn,
            categoryColorMap,
            fillColor,
            pointMissingColumn,
            viz?.missingData?.show,
            viz?.missingData?.color,
            hlVersion
          ],
          getPointRadius: [
            usesVariablePointSize,
            viz?.mapping.sizeColumn,
            viz?.mapping.valueColumn,
            minValue,
            maxValue,
            viz?.classification?.breaks,
            viz?.symbols?.minSize,
            viz?.symbols?.maxSize,
            viz?.symbols?.sizeScale,
            pointMissingColumn,
            viz?.missingData?.show,
            viz?.missingData?.size
          ],
          getLineColor: [
            strokeColor,
            rawStrokeOpacity,
            pointMissingColumn,
            viz?.missingData?.show,
            hlVersion
          ]
        }
      })
    ];
  }

  // Parse Arrow table to binary point data
  const pointData = resolvePointParser(ctx.customProjection)(jsTable);
  if (usesDoubleProportionalSymbols(viz)) {
    return createDoubleProportionalPointLayers(
      pointData,
      jsTable,
      ctx,
      layerId
    );
  }
  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    jsTable,
    viz,
    categoryColorMap,
    viz?.mapping.categoryColumn
  );

  // Build fill color: choropleth > categorical > static
  const baseFillAccessor =
    useChoropleth && viz
      ? createChoroplethColorAccessor(
          viz.mapping.valueColumn!,
          viz.classification!.breaks!,
          viz.classification!.colors!
        )
      : useCategoricalColor && viz
        ? createCategoricalColorAccessor(
            viz.mapping.categoryColumn!,
            effectiveCategoryColorMap
          )
        : null;

  const fillColorAccessor =
    pointMissingColumn || hasHighlights
      ? (row: DeckDataRow): [number, number, number, number] => {
          const rowOpacity = resolveHighlightedOpacityForRow(
            row,
            rawFillOpacity,
            highlightedRowIds
          );
          if (
            pointMissingColumn &&
            isMissingThematicValue(row[pointMissingColumn])
          ) {
            return showMissingPoints
              ? toMutableRgba(withOpacity(missingPointColor, rowOpacity))
              : [0, 0, 0, 0];
          }

          if (baseFillAccessor) {
            const [r, g, b] = baseFillAccessor(row);
            const alpha = Math.round(
              Math.min(Math.max(rowOpacity, 0), 1) * 255
            );
            return [r, g, b, alpha];
          }

          return toMutableRgba(withOpacity(fillColor, rowOpacity));
        }
      : baseFillAccessor;

  // Binary attributes — must be in data.attributes for ScatterplotLayer binary data
  const fillColorBinAttr = fillColorAccessor
    ? pointColorAttr(pointData, rowAccessor(jsTable, fillColorAccessor))
    : null;

  // Build line color
  const lineColorAccessor =
    pointMissingColumn || hasHighlights
      ? (row: DeckDataRow): [number, number, number, number] => {
          if (
            pointMissingColumn &&
            isMissingThematicValue(row[pointMissingColumn]) &&
            !showMissingPoints
          ) {
            return [0, 0, 0, 0];
          }

          return toMutableRgba(
            withOpacity(
              strokeColor,
              resolveHighlightedOpacityForRow(
                row,
                rawStrokeOpacity,
                highlightedRowIds
              )
            )
          );
        }
      : null;

  const lineColorBinAttr = lineColorAccessor
    ? pointColorAttr(pointData, rowAccessor(jsTable, lineColorAccessor))
    : null;

  // Build radius: static or per-feature attribute
  const baseRadiusAccessor =
    useClassedSymbols && viz
      ? createClassedSizeAccessor(
          viz.mapping.valueColumn!,
          viz.classification!.breaks!,
          minPointRadius,
          maxPointRadius,
          viz.classification?.numClasses ?? viz.classification?.colors?.length
        )
      : useProportionalSymbols && viz
        ? createProportionalSizeAccessor(
            viz.mapping.sizeColumn!,
            minValue,
            maxValue,
            minPointRadius,
            maxPointRadius,
            viz.symbols!.sizeScale
          )
        : null;

  const radiusAccessor =
    pointMissingColumn || baseRadiusAccessor
      ? (row: DeckDataRow): number => {
          if (
            pointMissingColumn &&
            isMissingThematicValue(row[pointMissingColumn])
          ) {
            return showMissingPoints ? missingPointRadius : 0;
          }

          if (baseRadiusAccessor) {
            return baseRadiusAccessor(row);
          }

          return uniquePointRadius;
        }
      : null;

  const radiusBinAttr = radiusAccessor
    ? pointRadiusAttr(pointData, rowAccessor(jsTable, radiusAccessor))
    : null;

  // Inject binary attributes into data.attributes for ScatterplotLayer
  const scatterProps = createScatterplotLayerProps(pointData);
  const scatterBinaryData = scatterProps.data as {
    attributes: Record<string, unknown>;
    khartisSourceTable?: ArrowTable;
  };
  scatterBinaryData.khartisSourceTable = jsTable;
  if (fillColorBinAttr) {
    scatterBinaryData.attributes.getFillColor = fillColorBinAttr;
  }
  if (lineColorBinAttr) {
    scatterBinaryData.attributes.getLineColor = lineColorBinAttr;
  }
  if (radiusBinAttr) {
    scatterBinaryData.attributes.getRadius = radiusBinAttr;
  }

  // DataFilterExtension for GPU-side year filtering (binary points)
  const yearFilterProps = ctx.yearFilter
    ? buildYearFilterProps(
        pointData,
        scatterBinaryData,
        jsTable,
        ctx.yearFilter
      )
    : null;

  return [
    new ScatterplotLayer({
      id: layerId,
      ...(scatterProps as unknown as Record<string, unknown>),
      stroked: true,
      ...(!fillColorBinAttr && {
        getFillColor: withOpacity(fillColor, hasHighlights ? 1 : rawFillOpacity)
      }),
      ...(!lineColorBinAttr && {
        getLineColor: withOpacity(strokeColor, rawStrokeOpacity)
      }),
      opacity: hasHighlights ? 1 : rawFillOpacity,
      ...(!radiusBinAttr && { getRadius: uniquePointRadius }),
      radiusScale: 1,
      radiusUnits: 'pixels',
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 3,
      pickable: true,
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      ...yearFilterProps,
      updateTriggers: {
        getFillColor: [
          useChoropleth,
          viz?.mapping.valueColumn,
          viz?.classification?.breaks,
          viz?.classification?.colors,
          useCategoricalColor,
          viz?.mapping.categoryColumn,
          categoryColorMap,
          viz?.classification?.labels,
          fillColor,
          pointMissingColumn,
          viz?.missingData?.show,
          viz?.missingData?.color,
          hlVersion
        ],
        getRadius: [
          usesVariablePointSize,
          viz?.mapping.sizeColumn,
          viz?.mapping.valueColumn,
          minValue,
          maxValue,
          viz?.classification?.breaks,
          viz?.symbols?.size,
          viz?.symbols?.minSize,
          viz?.symbols?.maxSize,
          viz?.symbols?.sizeScale,
          pointMissingColumn,
          viz?.missingData?.show,
          viz?.missingData?.size
        ],
        getLineColor: [
          strokeColor,
          rawStrokeOpacity,
          pointMissingColumn,
          viz?.missingData?.show,
          hlVersion
        ]
        // Note: getFilterValue is a binary attribute (baked once via filterValueAttr),
        // not a per-frame accessor. Year changes are handled by filterRange prop alone.
      }
    })
  ];
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
  const lineDashed = viz?.style.lineDashed ?? false;
  const lineDashArray = lineDashed ? DEFAULT_DASH_ARRAY : [0, 0];

  const hasLineHighlights =
    lineHighlightedRowIds && lineHighlightedRowIds.size > 0;
  const hlVersion = ctx.highlightVersion ?? 0;
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
    !!viz?.mapping.sizeColumn &&
    (viz?.modes?.thickness !== undefined
      ? viz.modes.thickness === ThicknessMode.PROPORTIONAL
      : viz?.type === VisualizationType.PROPORTIONAL);
  const useClassedWidth =
    viz?.modes?.thickness === ThicknessMode.CLASSES &&
    !!viz.mapping.valueColumn &&
    !!viz.classification?.breaks &&
    viz.classification.breaks.length >= 2;
  const usesVariableLineWidth = useProportionalWidth || useClassedWidth;
  const { min: minValue, max: maxValue } = statistics;
  const resolvedSizeScale = viz?.symbols?.sizeScale ?? ScaleType.LINEAR;
  const maxLineWidth = viz?.style.lineMaxWidth ?? resolvedLineWidth;

  const lineLayerBaseId = createThematicLayerId(DeckLayerId.LINE_LAYER, ctx);
  const layerId = lineDashed
    ? `${lineLayerBaseId}-dashed`
    : `${lineLayerBaseId}-solid`;
  const primitiveFilters = viz?.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
  const primitiveOrder = ctx.primitiveOrder ?? [
    PrimitiveFilterType.POINT,
    PrimitiveFilterType.LINE
  ];
  const getOrderIndex = (primitive: PrimitiveFilter): number => {
    const index = primitiveOrder.indexOf(primitive);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  const isNativeGeoArrowLine =
    arrowExtension &&
    (arrowExtension === ArrowExtension.GEOARROW_LINESTRING ||
      arrowExtension === ArrowExtension.GEOARROW_MULTILINESTRING);

  if ((isNativeGeoArrowLine || isNativeGeoArrow) && !lineDashed) {
    const lineData = resolvePathParser(ctx.customProjection)(jsTable);
    const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
      jsTable,
      viz,
      categoryColorMap,
      viz?.mapping.categoryColumn
    );

    // Build color: choropleth > categorical > static
    const choroplethAccessor =
      useChoropleth && viz
        ? createChoroplethColorAccessor(
            viz.mapping.valueColumn!,
            viz.classification!.breaks!,
            viz.classification!.colors!
          )
        : null;

    const categoricalAccessor =
      useCategoricalColor && viz
        ? createCategoricalColorAccessor(
            viz.mapping.categoryColumn!,
            effectiveCategoryColorMap
          )
        : null;

    const baseColorFn = choroplethAccessor ?? categoricalAccessor;

    const baseLineColorAccessor = baseColorFn
      ? (row: DeckDataRow) =>
          withOpacity(baseColorFn(row), normalizedLineOpacity) as [
            number,
            number,
            number,
            number
          ]
      : null;

    const lineColorFn =
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
        : baseLineColorAccessor;

    // Binary color attribute — must be in data.attributes for PathLayer binary data
    const colorBinaryAttr = lineColorFn
      ? pathColorAttr(lineData, rowAccessor(jsTable, lineColorFn))
      : null;

    // Build width: proportional or static
    const widthFn =
      useClassedWidth && viz
        ? createClassedSizeAccessor(
            viz.mapping.valueColumn!,
            viz.classification!.breaks!,
            1,
            maxLineWidth,
            viz.classification?.numClasses ?? viz.classification?.colors?.length
          )
        : useProportionalWidth && viz
          ? createProportionalSizeAccessor(
              viz.mapping.sizeColumn!,
              minValue,
              maxValue,
              1,
              maxLineWidth,
              resolvedSizeScale
            )
          : null;

    const widthBinaryAttr = widthFn
      ? pathWidthAttr(lineData, rowAccessor(jsTable, widthFn))
      : null;

    // Inject binary attributes into data.attributes for PathLayer
    const pathProps = createPathLayerProps(lineData);
    const pathBinaryData = pathProps.data as {
      attributes: Record<string, unknown>;
      khartisSourceTable?: ArrowTable;
    };
    pathBinaryData.khartisSourceTable = jsTable;
    if (colorBinaryAttr) {
      pathBinaryData.attributes.getColor = colorBinaryAttr;
    }
    if (widthBinaryAttr) {
      pathBinaryData.attributes.getWidth = widthBinaryAttr;
    }

    // DataFilterExtension for GPU-side year filtering (binary lines)
    const lineYearFilterProps = ctx.yearFilter
      ? buildYearFilterProps(lineData, pathBinaryData, jsTable, ctx.yearFilter)
      : null;

    const lineLayer = new PathLayer({
      id: layerId,
      ...(pathProps as unknown as Record<string, unknown>),
      ...(!colorBinaryAttr && {
        getColor: withOpacity(resolvedLineColor, normalizedLineOpacity)
      }),
      extensions: lineDashed ? [DASH_EXTENSION] : [],
      getDashArray: lineDashArray,
      dashJustified: true,
      widthUnits: 'pixels',
      ...(!widthBinaryAttr && { getWidth: resolvedLineWidth }),
      widthMinPixels: 1,
      pickable: true,
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
      ...(modelMatrix && { modelMatrix }),
      ...(beforeId && { beforeId }),
      ...lineYearFilterProps,
      updateTriggers: {
        getColor: [
          useChoropleth,
          useCategoricalColor,
          viz?.mapping.valueColumn,
          viz?.mapping.categoryColumn,
          viz?.classification?.breaks,
          viz?.classification?.colors,
          categoryColorMap,
          viz?.classification?.labels,
          resolvedLineColor,
          normalizedLineOpacity,
          hlVersion
        ],
        getDashArray: [lineDashed],
        getWidth: [
          usesVariableLineWidth,
          viz?.mapping.sizeColumn,
          viz?.mapping.valueColumn,
          minValue,
          maxValue,
          viz?.classification?.breaks,
          maxLineWidth,
          resolvedSizeScale,
          resolvedLineWidth
        ]
      }
    });

    const pointLayers = createRepresentativePointSymbolLayers(jsTable, ctx);

    return [
      ...(primitiveFilters.includes(PrimitiveFilterType.LINE)
        ? [
            {
              primitive: PrimitiveFilterType.LINE as PrimitiveFilter,
              layer: lineLayer
            }
          ]
        : []),
      ...pointLayers.map((layer) => ({
        primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
        layer
      }))
    ]
      .sort(
        (left, right) =>
          getOrderIndex(right.primitive) - getOrderIndex(left.primitive)
      )
      .map((entry) => entry.layer);
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
    const rawGeoJSON = getCachedGeoJSON(jsTable, geoColumn);
    lineGeojsonData =
      rawGeoJSON && ctx.customProjection
        ? projectGeoJSON(rawGeoJSON, ctx.customProjection)
        : rawGeoJSON;
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

  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    jsTable,
    viz,
    categoryColorMap,
    viz?.mapping.categoryColumn
  );

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
                effectiveCategoryColorMap,
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
    useClassedWidth && viz
      ? createGeoJsonClassedSizeAccessor(
          viz.mapping.valueColumn!,
          viz.classification!.breaks!,
          1,
          maxLineWidth,
          viz.classification?.numClasses ?? viz.classification?.colors?.length,
          resolvedLineWidth
        )
      : useProportionalWidth && viz
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
  const filteredLineGeojsonData = filterGeoJsonByYear(
    lineGeojsonData,
    ctx.yearFilter
  );

  const lineLayer = new GeoJsonLayer({
    id: layerId,
    data: filteredLineGeojsonData,
    stroked: true,
    filled: false,
    getLineColor: geoJsonLineColor,
    extensions: lineDashed ? [DASH_EXTENSION] : [],
    getDashArray: lineDashArray,
    dashJustified: true,
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
        viz?.classification?.labels,
        resolvedLineColor,
        normalizedLineOpacity,
        hlVersion
      ],
      getDashArray: [lineDashed],
      getLineWidth: [
        usesVariableLineWidth,
        viz?.mapping.sizeColumn,
        viz?.mapping.valueColumn,
        minValue,
        maxValue,
        viz?.classification?.breaks,
        maxLineWidth,
        resolvedSizeScale,
        resolvedLineWidth
      ]
    }
  });

  const pointLayers = createRepresentativePointSymbolLayers(jsTable, ctx);

  return [
    ...(primitiveFilters.includes(PrimitiveFilterType.LINE)
      ? [
          {
            primitive: PrimitiveFilterType.LINE as PrimitiveFilter,
            layer: lineLayer
          }
        ]
      : []),
    ...pointLayers.map((layer) => ({
      primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
      layer
    }))
  ]
    .sort(
      (left, right) =>
        getOrderIndex(right.primitive) - getOrderIndex(left.primitive)
    )
    .map((entry) => entry.layer);
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
    beforeId,
    categoryColorMap
  } = ctx;
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

  const useChoropleth = viz && shouldApplyChoropleth(viz);
  const useCategoricalColor = viz && shouldApplyCategorical(viz);
  const strokeDashed = viz?.style.strokeDashed ?? false;
  const strokeDashArray = strokeDashed ? DEFAULT_DASH_ARRAY : [0, 0];
  const layerId = createThematicLayerId(DeckLayerId.POLYGON_LAYER, ctx);
  const patternProps = buildPatternProps(ctx);

  if (!isNativeGeoArrow && !isGeoJsonEncoded && !isWkbEncoded) {
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
        jsTable,
        viz,
        categoryColorMap,
        viz?.mapping.categoryColumn
      );

      // Build fill color: choropleth > categorical > static, with optional highlight dimming
      const choroplethAccessor =
        useChoropleth && viz
          ? createChoroplethColorAccessor(
              viz.mapping.valueColumn!,
              viz.classification!.breaks!,
              viz.classification!.colors!
            )
          : null;

      const categoricalAccessor =
        useCategoricalColor && viz
          ? createCategoricalColorAccessor(
              viz.mapping.categoryColumn!,
              effectiveCategoryColorMap
            )
          : null;

      const baseFillAccessor = choroplethAccessor ?? categoricalAccessor;

      const fillColorFn =
        hasPolyHighlights && polyHighlightedRowIds
          ? baseFillAccessor
            ? withRowHighlightAccessor(
                baseFillAccessor,
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
          : baseFillAccessor;

      // Binary fill color attribute — must be in data.attributes for SolidPolygonLayer binary data
      const fillColorBinaryAttr = fillColorFn
        ? createPolygonFillColorAttribute(
            polyData,
            rowAccessor(jsTable, fillColorFn)
          )
        : null;

      // Build stroke color
      const strokeColorFn = hasPolyHighlights
        ? withRowHighlight(
            strokeColor,
            rawPolyStrokeOpacity,
            HIGHLIGHT_DIMMING_FACTOR,
            polyHighlightedRowIds!
          )
        : null;

      const strokeColorBinaryAttr = strokeColorFn
        ? pathColorAttr(outlineData, rowAccessor(jsTable, strokeColorFn))
        : null;

      const layers: Layer<DeckDataRow>[] = [];

      // Build SolidPolygonLayer props, injecting fill color into data.attributes when binary
      const solidProps = createSolidPolygonLayerProps(polyData);
      const solidBinaryData = solidProps.data as {
        attributes: Record<string, unknown>;
        khartisSourceTable?: ArrowTable;
      };
      solidBinaryData.khartisSourceTable = jsTable;
      if (fillColorBinaryAttr) {
        solidBinaryData.attributes.getFillColor = fillColorBinaryAttr;
      }

      // DataFilterExtension for GPU-side year filtering (binary polygons)
      const polyYearFilterProps = ctx.yearFilter
        ? buildYearFilterProps(
            polyData,
            solidBinaryData,
            jsTable,
            ctx.yearFilter
          )
        : {};

      // Fill layer
      const fillLayer = new SolidPolygonLayer({
        id: layerId,
        ...(solidProps as unknown as Record<string, unknown>),
        ...(!fillColorBinaryAttr && {
          getFillColor: [fillColor[0], fillColor[1], fillColor[2], 255] as [
            number,
            number,
            number,
            number
          ]
        }),
        opacity: hasPolyHighlights ? 1 : rawPolyFillOpacity,
        pickable: true,
        autoHighlight: true,
        highlightColor: HOVER_HIGHLIGHT_COLOR,
        parameters: {
          depthCompare: 'always' as const,
          stencilCompare: 'always' as const
        },
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        ...polyYearFilterProps,
        updateTriggers: {
          getFillColor: [
            useChoropleth,
            useCategoricalColor,
            viz?.mapping.valueColumn,
            viz?.mapping.categoryColumn,
            viz?.classification?.breaks,
            viz?.classification?.colors,
            categoryColorMap,
            viz?.classification?.labels,
            fillColor,
            hlVersion
          ]
        }
      });

      // Stroke layer — inject binary color into data.attributes if needed
      const strokePathProps = createPathLayerProps(outlineData);
      const strokeBinaryData = strokePathProps.data as {
        attributes: Record<string, unknown>;
      };
      if (strokeColorBinaryAttr) {
        strokeBinaryData.attributes.getColor = strokeColorBinaryAttr;
      }

      // DataFilterExtension for GPU-side year filtering (binary polygon strokes)
      const strokeYearFilterProps = ctx.yearFilter
        ? buildYearFilterProps(
            outlineData,
            strokeBinaryData,
            jsTable,
            ctx.yearFilter
          )
        : {};

      let strokeLayer: Layer<DeckDataRow>;
      if (strokeDashed) {
        strokeLayer = new PathLayer({
          id: `${layerId}-stroke-dashed`,
          ...(strokePathProps as unknown as Record<string, unknown>),
          ...(!strokeColorBinaryAttr && {
            getColor: withOpacity(strokeColor, rawPolyStrokeOpacity)
          }),
          extensions: [DASH_EXTENSION],
          getDashArray: DEFAULT_DASH_ARRAY,
          dashJustified: true,
          widthUnits: 'pixels',
          getWidth: strokeWidth / 4,
          widthMinPixels: 1,
          pickable: false,
          ...(modelMatrix && { modelMatrix }),
          ...(beforeId && { beforeId }),
          ...strokeYearFilterProps,
          updateTriggers: {
            getColor: [strokeColor, rawPolyStrokeOpacity, hlVersion],
            getDashArray: [strokeDashed],
            getWidth: [strokeWidth]
          }
        });
      } else {
        strokeLayer = new PathLayer({
          id: `${layerId}-stroke-solid`,
          ...(strokePathProps as unknown as Record<string, unknown>),
          ...(!strokeColorBinaryAttr && {
            getColor: withOpacity(strokeColor, rawPolyStrokeOpacity)
          }),
          widthUnits: 'pixels',
          getWidth: strokeWidth / 4,
          widthMinPixels: 1,
          pickable: false,
          ...(modelMatrix && { modelMatrix }),
          ...(beforeId && { beforeId }),
          ...strokeYearFilterProps,
          updateTriggers: {
            getColor: [strokeColor, rawPolyStrokeOpacity, hlVersion],
            getWidth: [strokeWidth]
          }
        });
      }

      const pointLayers = createRepresentativePointSymbolLayers(jsTable, ctx);

      // Determine layer order and stroke visibility from context
      const DEFAULT_PRIMITIVE_ORDER: PrimitiveFilter[] = [
        PrimitiveFilterType.POINT,
        PrimitiveFilterType.LINE,
        PrimitiveFilterType.POLYGON
      ];
      const primitiveFilters =
        ctx.viz?.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
      const primitiveOrder = ctx.primitiveOrder ?? DEFAULT_PRIMITIVE_ORDER;
      const showStroke =
        primitiveFilters.includes(PrimitiveFilterType.LINE) &&
        (ctx.viz?.modes?.stroke ?? StrokeMode.UNIQUE) !== StrokeMode.NONE;
      const showFill = primitiveFilters.includes(PrimitiveFilterType.POLYGON);
      const getOrderIndex = (primitive: PrimitiveFilter): number => {
        const index = primitiveOrder.indexOf(primitive);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
      };
      const orderedLayers = [
        ...(showFill
          ? [{ primitive: PrimitiveFilterType.POLYGON, layer: fillLayer }]
          : []),
        ...(showStroke
          ? [{ primitive: PrimitiveFilterType.LINE, layer: strokeLayer }]
          : []),
        ...pointLayers.map((layer) => ({
          primitive: PrimitiveFilterType.POINT as PrimitiveFilter,
          layer
        }))
      ].sort(
        (left, right) =>
          getOrderIndex(right.primitive) - getOrderIndex(left.primitive)
      );

      layers.push(...orderedLayers.map((entry) => entry.layer));

      // Pattern overlay: separate GeoJsonLayer on top with pattern as semi-transparent mask
      if (patternProps) {
        let patternGeojson;
        try {
          patternGeojson = getCachedGeoJSON(jsTable, geoColumn);
        } catch {
          // Silently skip pattern overlay if GeoJSON conversion fails
        }
        if (patternGeojson) {
          layers.push(
            new GeoJsonLayer({
              id: `${layerId}-pattern-${viz?.classification?.patternId ?? 'none'}`,
              data: patternGeojson,
              getFillColor: [0, 0, 0, 255],
              stroked: false,
              opacity: 0.6,
              pickable: false,
              extensions: patternProps.extensions,
              fillPatternAtlas: patternProps.fillPatternAtlas,
              fillPatternMapping: patternProps.fillPatternMapping,
              fillPatternMask: true,
              getFillPattern: patternProps.getFillPattern,
              getFillPatternScale: patternProps.getFillPatternScale,
              getFillPatternRotation: patternProps.getFillPatternRotation,
              ...(modelMatrix && { modelMatrix }),
              ...(beforeId && { beforeId }),
              updateTriggers: {
                getFillPattern: [viz?.classification?.patternId],
                getFillPatternScale: [viz?.classification?.patternId],
                getFillPatternRotation: [viz?.classification?.patternId]
              },
              dataComparator: (newData, oldData) => newData === oldData
            })
          );
        }
      }

      return layers;
    } catch (error) {
      logger.warn(
        'Binary polygon parsing failed, falling back to GeoJSON',
        LogCategory.MAP,
        {
          encoding: arrowExtension,
          geoColumn,
          error: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  let geojsonData;
  try {
    const rawGeoJSON = getCachedGeoJSON(jsTable, geoColumn);
    // When a basemap projection is active, pre-project GeoJSON coordinates
    // so data aligns with the projected basemap coordinate space.
    geojsonData =
      rawGeoJSON && ctx.customProjection
        ? projectGeoJSON(rawGeoJSON, ctx.customProjection)
        : rawGeoJSON;
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

  const effectiveCategoryColorMap = resolveEffectiveCategoryColorMap(
    jsTable,
    viz,
    categoryColorMap,
    viz?.mapping.categoryColumn
  );

  const baseGeoJsonFillColor =
    useChoropleth && viz
      ? createGeoJsonChoroplethColorAccessor(
          viz.mapping.valueColumn!,
          viz.classification!.breaks!,
          viz.classification!.colors!,
          fillColor
        )
      : useCategoricalColor && viz
        ? createGeoJsonCategoricalColorAccessor(
            viz.mapping.categoryColumn!,
            effectiveCategoryColorMap,
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

  const showGeoJsonStroke =
    (ctx.viz?.modes?.stroke ?? StrokeMode.UNIQUE) !== StrokeMode.NONE;
  const filteredPolygonGeojsonData = filterGeoJsonByYear(
    geojsonData,
    ctx.yearFilter
  );

  const geoJsonLayers: Layer<DeckDataRow>[] = [
    new GeoJsonLayer({
      id: layerId,
      data: filteredPolygonGeojsonData,
      getFillColor: geoJsonFillColor,
      getLineColor: geoJsonStrokeColor,
      stroked: showGeoJsonStroke,
      extensions: showGeoJsonStroke && strokeDashed ? [DASH_EXTENSION] : [],
      getDashArray: strokeDashArray,
      dashJustified: true,
      opacity: hasPolyHighlights ? 1 : rawPolyFillOpacity,
      lineWidthUnits: 'pixels',
      lineWidthScale: strokeWidth / 4,
      pickable: true,
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
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
          viz?.mapping.valueColumn,
          viz?.mapping.categoryColumn,
          viz?.classification?.breaks,
          viz?.classification?.colors,
          categoryColorMap,
          viz?.classification?.labels,
          fillColor,
          hlVersion
        ],
        getLineColor: [strokeColor, rawPolyStrokeOpacity, hlVersion],
        getDashArray: [strokeDashed]
      },
      dataComparator: (newData, oldData) => newData === oldData
    })
  ];

  // Pattern overlay: separate layer on top with pattern as semi-transparent mask
  if (patternProps) {
    geoJsonLayers.push(
      new GeoJsonLayer({
        id: `${layerId}-pattern-${viz?.classification?.patternId ?? 'none'}`,
        data: geojsonData,
        getFillColor: [0, 0, 0, 255],
        stroked: false,
        opacity: 0.6,
        pickable: false,
        extensions: patternProps.extensions,
        fillPatternAtlas: patternProps.fillPatternAtlas,
        fillPatternMapping: patternProps.fillPatternMapping,
        fillPatternMask: true,
        getFillPattern: patternProps.getFillPattern,
        getFillPatternScale: patternProps.getFillPatternScale,
        getFillPatternRotation: patternProps.getFillPatternRotation,
        ...(modelMatrix && { modelMatrix }),
        ...(beforeId && { beforeId }),
        updateTriggers: {
          getFillPattern: [viz?.classification?.patternId],
          getFillPatternScale: [viz?.classification?.patternId],
          getFillPatternRotation: [viz?.classification?.patternId]
        },
        dataComparator: (newData, oldData) => newData === oldData
      })
    );
  }

  return geoJsonLayers;
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

  // When a basemap projection is active, pre-project GeoJSON coordinates
  const data = ctx.customProjection
    ? projectGeoJSON(geojson, ctx.customProjection)
    : geojson;
  const filteredData = filterGeoJsonByYear(data, ctx.yearFilter);

  return [
    new GeoJsonLayer({
      id: layerId,
      data: filteredData,
      filled: true,
      stroked: true,
      getFillColor: [...fillColor, Math.round(fillOpacity * 255)],
      getLineColor: withOpacity(strokeColor, strokeOpacity),
      getLineWidth: strokeWidth,
      lineWidthMinPixels: Math.max(1, strokeWidth),
      pickable: true,
      autoHighlight: true,
      highlightColor: HOVER_HIGHLIGHT_COLOR,
      parameters: {
        depthCompare: 'always' as const,
        stencilCompare: 'always' as const
      },
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
  if (jsTable.numRows === 0) {
    logger.debug(
      'Skipping thematic layer creation for empty Arrow table',
      LogCategory.MAP,
      {
        datasetId: ctx.datasetId
      }
    );
    return [];
  }

  // Opt 5: reuse pre-computed geometryInfo from context when available
  const geometryInfo = ctx.geometryInfo ?? extractGeometryInfo(jsTable);

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
  const isPolygonGeometry =
    resolvedGeometryType === GeometryType.POLYGON ||
    resolvedGeometryType === GeometryType.MULTIPOLYGON;
  const isLineGeometry =
    resolvedGeometryType === GeometryType.LINESTRING ||
    resolvedGeometryType === GeometryType.MULTILINESTRING;
  const isPrimitiveFilteredOut =
    !isPolygonGeometry &&
    !isLineGeometry &&
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
