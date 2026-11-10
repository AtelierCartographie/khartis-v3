import {
  CATEGORY_SHAPE_CYCLE,
  DENSITY_DEFAULTS,
  CategoryShapeMode,
  ColorMode,
  DEFAULT_COLORS,
  FillMode,
  MissingDataShape,
  ProportionalType,
  ShapeType,
  SizeMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode,
  isLinearShape
} from '$lib/features/commons/constants/visualization.constants';
import type { BasemapDottedPattern } from '$lib/features/commons/constants/visualization.constants';
import {
  getLinePrimitive,
  getLineThicknessClassification,
  getPolygonPrimitive,
  getPrimitiveClassification,
  getSymbolPrimitive,
  getTextPrimitive,
  PrimitiveFilterType,
  ScaleType,
  type ClassificationConfig,
  type MissingDataConfig,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  isSignedProportionalSymbol,
  resolveSymbolSignColors
} from '$lib/features/commons/utils/symbol-sign.utils';
import {
  formatCalendarBoundary,
  formatCalendarClassLabel
} from '$lib/features/commons/utils/calendar-breaks.utils';
import {
  classCaseExpression,
  classFilterExpression,
  type ClassValueKind,
  resolveClassIntervals,
  type ClassInterval
} from './qgis-classes';
import {
  resolveClassPatternPalette,
  resolveMissingDataClassPattern
} from '$lib/features/map/layers/polygon-pattern-layer.utils';
import { resolveQgisPattern } from './qgis-patterns';
import {
  MM_PER_PAGE_UNIT,
  PT_PER_PAGE_UNIT,
  qgisField,
  qgisNumber,
  qgisString,
  type DataDefinedProperties,
  type QmlCategory,
  type QmlLabelRule,
  type QmlLayerStyle,
  type QmlRenderer,
  type QmlRule,
  type QmlStroke,
  type QmlSymbol,
  type QmlSymbolLayer,
  type Rgba
} from './qml';

// Mirrors the renderer: page pixels in, millimetres out.
const POLYGON_STROKE_WIDTH_DIVISOR = 4;
const SYMBOL_STROKE_WIDTH_DIVISOR = 3;
const NEUTRAL_FILL = '#b4b4b4';
const NEUTRAL_STROKE = '#333333';
const LINE_GAP_PX = 2;

/** Something of the map the export could not carry, said in the memo. */
export type QgisExportNoteCode =
  | 'pattern-fill'
  | 'pattern-approximate'
  | 'missing-pattern'
  | 'double-symbols'
  | 'symbol-shapes'
  | 'knockout'
  | 'label-placement'
  | 'font'
  | 'label-edits'
  | 'label-leaders';

export interface QgisExportNote {
  code: QgisExportNoteCode;
  /** Free values for the message, already formatted. */
  detail?: string;
}

export type QgisLayerGeometry = 'polygon' | 'line' | 'point';

/** Double proportional symbols: one exported row per feature and variable. */
export interface DoubleSymbolRows {
  /** 'A' for the size variable, 'B' for the second one. */
  roleField: string;
  /** The value of the row's own variable. */
  valueField: string;
  primary: string;
  secondary: string;
}

export const DOUBLE_SYMBOL_FIELDS = {
  roleField: 'khartis_role',
  valueField: 'khartis_valeur'
} as const;

export interface QgisLayerPlan {
  primitive: PrimitiveFilter;
  doubleSymbols?: DoubleSymbolRows;
  /** Points for symbols and labels: the representative point of each feature. */
  geometry: QgisLayerGeometry;
  /** Data columns the style reads. */
  columns: string[];
  style: QmlLayerStyle;
  notes: QgisExportNote[];
  /** Symbol sizes proportional to one variable: QGIS can draw their legend. */
  proportionalSize?: boolean;
  /** One colour for every symbol: the size alone carries the legend. */
  uniqueColor?: boolean;
}

export interface QgisStyleContext {
  /** The domain the map scales a proportional variable against. */
  domain: (
    primitive: PrimitiveFilter,
    column: string
  ) => { min: number; max: number } | null;
  formatValue: (value: number) => string;
  missingDataLabel: string;
  /** Some feature of the primitive lacks its value. */
  hasMissingData: (primitive: PrimitiveFilter) => boolean;
  /** How a column is exported, for date classes; numbers when absent. */
  columnKind?: (column: string) => ClassValueKind;
  locale?: string;
}

function kindOf(
  context: QgisStyleContext,
  column: string,
  classification: ClassificationConfig | undefined
): ClassValueKind {
  const kind = context.columnKind?.(column) ?? 'number';
  return kind !== 'number' && !classification?.calendarStep ? 'epoch' : kind;
}

function toRgba(
  hex: string | undefined,
  opacity = 1,
  fallback = NEUTRAL_FILL
): Rgba {
  const value = (hex ?? fallback).replace('#', '');
  const normalized =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  const channel = (index: number) => {
    const parsed = parseInt(normalized.slice(index, index + 2), 16);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return [
    channel(0),
    channel(2),
    channel(4),
    Math.round(normalizeOpacity(opacity) * 255)
  ];
}

function firstColor(color: string | string[] | undefined): string | undefined {
  return Array.isArray(color) ? color[0] : color;
}

/** Older projects stored opacities as percentages. */
function normalizeOpacity(value: number | undefined, fallback = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value > 1 ? value / 100 : value));
}

function qgisColor(rgba: Rgba): string {
  return `color_rgba(${rgba.join(',')})`;
}

function pxToMm(px: number): number {
  return px * MM_PER_PAGE_UNIT;
}

const DASH_ARRAYS: Record<string, [number, number]> = {
  dots: [1, 3],
  dashes: [6, 4],
  'dash-dot': [2, 2],
  'long-dash': [12, 4]
};

function dashMm(
  dashed: boolean | undefined,
  pattern: BasemapDottedPattern | undefined,
  widthMm: number
): number[] | null {
  if (!dashed) {
    return null;
  }
  const [dash, gap] = DASH_ARRAYS[pattern ?? 'dashes'] ?? DASH_ARRAYS.dashes;
  return [dash * widthMm, gap * widthMm];
}

function classCount(classification: ClassificationConfig): number {
  // A thickness or size classification has no colours.
  return (
    classification.numClasses ??
    classification.colors?.length ??
    classification.classes ??
    0
  );
}

function classIntervals(
  classification: ClassificationConfig | undefined,
  count = classification ? classCount(classification) : 0
): ClassInterval[][] | null {
  return classification
    ? resolveClassIntervals(classification.breaks, count)
    : null;
}

function intervalLabel(
  intervals: ClassInterval[],
  classification: ClassificationConfig,
  context: QgisStyleContext
): string {
  const interval = intervals[0] ?? {};
  const step = classification.calendarStep;
  const locale = context.locale ?? 'fr';
  // Date breaks are epoch milliseconds: they read as dates, like the legend.
  const format = (value: number) =>
    step
      ? formatCalendarBoundary(value, step, locale)
      : context.formatValue(value);
  if (interval.min !== undefined && interval.max !== undefined) {
    return step
      ? formatCalendarClassLabel(interval.min, interval.max, step, locale)
      : `${format(interval.min)} – ${format(interval.max)}`;
  }
  if (interval.min !== undefined) {
    return `≥ ${format(interval.min)}`;
  }
  if (interval.max !== undefined) {
    return `< ${format(interval.max)}`;
  }
  return '';
}

function classLabel(
  classification: ClassificationConfig,
  intervals: ClassInterval[],
  index: number,
  context: QgisStyleContext
): string {
  const labels = classification.labels;
  return labels?.length === classCount(classification) && labels[index]
    ? labels[index]
    : intervalLabel(intervals, classification, context);
}

function categoryValues(
  classification: ClassificationConfig | undefined
): string[] {
  return (classification?.categoryValues ?? classification?.labels ?? [])
    .filter(
      (value) => value !== null && value !== undefined && String(value) !== ''
    )
    .map(String);
}

function categoryColor(
  classification: ClassificationConfig,
  index: number
): string | undefined {
  const colors = classification.colors ?? [];
  return colors.length > 0 ? colors[index % colors.length] : undefined;
}

function categoryCaseExpression(
  column: string,
  classification: ClassificationConfig,
  values: (index: number) => string,
  fallback: string
): string {
  const field = qgisField(column);
  const branches = categoryValues(classification).map(
    (category, index) =>
      `WHEN to_string(${field}) = ${qgisString(category)} THEN ${values(index)}`
  );
  return branches.length > 0
    ? `CASE ${branches.join(' ')} ELSE ${fallback} END`
    : fallback;
}

/** A colour driven by a classed or categorised variable, as a data-defined expression. */
function colorExpression(options: {
  mode: 'classes' | 'categories';
  column: string;
  classification: ClassificationConfig;
  opacity: number;
  fallback: string;
  kind?: ClassValueKind;
}): string {
  const { column, classification, opacity, fallback } = options;
  const colorOf = (hex: string | undefined) => qgisColor(toRgba(hex, opacity));
  if (options.mode === 'categories') {
    return categoryCaseExpression(
      column,
      classification,
      (index) => colorOf(categoryColor(classification, index)),
      fallback
    );
  }
  const intervals = classIntervals(classification);
  return intervals
    ? classCaseExpression(
        column,
        intervals,
        (classification.colors ?? []).map(colorOf),
        fallback,
        options.kind
      )
    : fallback;
}

function missingFilter(column: string): string {
  return `${qgisField(column)} IS NULL`;
}

function hasPattern(classification: ClassificationConfig | undefined): boolean {
  return Boolean(classification?.pattern || classification?.patternId);
}

// As the Khartis legend: shown, and some feature lacks the value.
function missingShows(
  missing: MissingDataConfig | undefined,
  context: QgisStyleContext,
  primitive: PrimitiveFilter
): boolean {
  return (missing?.show ?? true) && context.hasMissingData(primitive);
}

// ---------------------------------------------------------------------------
// Polygons
// ---------------------------------------------------------------------------

function polygonStroke(
  viz: VisualizationConfig,
  context: QgisStyleContext
): {
  stroke: QmlStroke | null;
  dataDefined: DataDefinedProperties;
  columns: string[];
} {
  const polygon = getPolygonPrimitive(viz);
  if (
    !polygon ||
    polygon.strokeMode === StrokeMode.NONE ||
    polygon.strokeWidth <= 0
  ) {
    return { stroke: null, dataDefined: {}, columns: [] };
  }
  const widthMm = pxToMm(polygon.strokeWidth / POLYGON_STROKE_WIDTH_DIVISOR);
  const opacity = normalizeOpacity(polygon.strokeOpacity);
  const stroke: QmlStroke = {
    color: toRgba(firstColor(polygon.strokeColor), opacity, NEUTRAL_STROKE),
    widthMm,
    dashMm: dashMm(polygon.strokeDashed, polygon.strokeDashedPattern, widthMm),
    cap: 'round'
  };
  const classification = polygon.strokeClassification;
  if (
    polygon.strokeMode === StrokeMode.CLASSES ||
    polygon.strokeMode === StrokeMode.CATEGORIES
  ) {
    const column =
      polygon.strokeMode === StrokeMode.CLASSES
        ? (polygon.strokeValueColumn ?? polygon.valueColumn)
        : (polygon.strokeCategoryColumn ?? polygon.categoryColumn);
    if (column && classification?.colors?.length) {
      return {
        stroke,
        dataDefined: {
          outlineColor: colorExpression({
            mode:
              polygon.strokeMode === StrokeMode.CLASSES
                ? 'classes'
                : 'categories',
            column,
            classification,
            opacity,
            fallback: qgisColor(stroke.color),
            kind: kindOf(context, column, classification)
          })
        },
        columns: [column]
      };
    }
  }
  return { stroke, dataDefined: {}, columns: [] };
}

function fillSymbol(
  color: Rgba | null,
  stroke: QmlStroke | null,
  dataDefined: DataDefinedProperties,
  patternLayers: QmlSymbolLayer[] = []
): QmlSymbol {
  if (patternLayers.length === 0) {
    return {
      type: 'fill',
      opacity: 1,
      layers: [{ kind: 'fill', color, stroke, dataDefined }]
    };
  }
  // The map draws outlines over the pattern.
  const outlineDataDefined: DataDefinedProperties = dataDefined.outlineColor
    ? { outlineColor: dataDefined.outlineColor }
    : {};
  return {
    type: 'fill',
    opacity: 1,
    layers: [
      { kind: 'fill', color, stroke: null },
      ...patternLayers,
      ...(stroke
        ? [{ kind: 'line' as const, stroke, dataDefined: outlineDataDefined }]
        : [])
    ]
  };
}

/**
 * The patterns of the map for each class or category, in QGIS layers, or
 * null when the classification has none. A motif QGIS cannot draw leaves the
 * class with its colour, and says so.
 */
function resolvePolygonPatterns(
  classification: ClassificationConfig | undefined,
  fillMode: FillMode,
  notes: QgisExportNote[]
): Array<QmlSymbolLayer[] | null> | null {
  const palette = resolveClassPatternPalette(classification, fillMode);
  if (!palette) {
    if (hasPattern(classification)) {
      notes.push({ code: 'pattern-fill' });
    }
    return null;
  }
  return palette.map((pattern) => {
    const qgis = resolveQgisPattern(pattern);
    if (!qgis) {
      notes.push({ code: 'pattern-fill' });
      return null;
    }
    if (qgis.approximate) {
      notes.push({ code: 'pattern-approximate' });
    }
    return qgis.layers;
  });
}

function buildPolygonPlan(
  viz: VisualizationConfig,
  context: QgisStyleContext
): QgisLayerPlan | null {
  const polygon = getPolygonPrimitive(viz);
  if (!polygon?.enabled) {
    return null;
  }
  const notes: QgisExportNote[] = [];
  const columns = new Set<string>();
  const {
    stroke,
    dataDefined,
    columns: strokeColumns
  } = polygonStroke(viz, context);
  strokeColumns.forEach((column) => columns.add(column));
  const opacity = normalizeOpacity(polygon.fillOpacity);
  const classification = getPrimitiveClassification(
    viz,
    PrimitiveFilterType.POLYGON
  );
  const missing = polygon.missingData;
  const missingPattern = missingShows(
    missing,
    context,
    PrimitiveFilterType.POLYGON
  )
    ? resolveMissingDataClassPattern(missing)
    : null;
  const missingPatternLayers = missingPattern
    ? resolveQgisPattern(missingPattern)
    : null;
  if (
    missing?.pattern &&
    missingShows(missing, context, PrimitiveFilterType.POLYGON) &&
    !missingPatternLayers
  ) {
    notes.push({ code: 'missing-pattern' });
  }
  const missingSymbol = () =>
    fillSymbol(
      toRgba(missing?.color ?? DEFAULT_COLORS.missingData, opacity),
      stroke,
      dataDefined,
      missingPatternLayers?.layers
    );
  // Under a pattern the map fills white, the motif tells classes apart.
  const patternBackground = toRgba('#ffffff', opacity);

  let renderer: QmlRenderer;
  if (polygon.fillMode === FillMode.DENSITY) {
    // The dots are a layer of their own (`buildDensityPlan`).
    renderer = {
      type: 'single',
      symbol: fillSymbol(null, stroke, dataDefined)
    };
  } else if (
    polygon.fillMode === FillMode.CLASSES &&
    polygon.valueColumn &&
    classification?.breaks?.length &&
    classification.colors?.length
  ) {
    const column = polygon.valueColumn;
    columns.add(column);
    const patterns = resolvePolygonPatterns(
      classification,
      polygon.fillMode,
      notes
    );
    const intervals = classIntervals(classification) ?? [];
    const rules: QmlRule[] = intervals.flatMap((classIntervalList, index) => {
      const filter = classFilterExpression(
        column,
        classIntervalList,
        kindOf(context, column, classification)
      );
      const pattern = patterns?.[index];
      return filter
        ? [
            {
              filter,
              label: classLabel(
                classification,
                classIntervalList,
                index,
                context
              ),
              symbol: pattern
                ? fillSymbol(patternBackground, stroke, dataDefined, pattern)
                : fillSymbol(
                    toRgba(classification.colors?.[index], opacity),
                    stroke,
                    dataDefined
                  )
            }
          ]
        : [];
    });
    if (missingShows(missing, context, PrimitiveFilterType.POLYGON)) {
      rules.push({
        filter: missingFilter(column),
        label: missing?.label ?? context.missingDataLabel,
        symbol: missingSymbol()
      });
    }
    renderer = { type: 'rules', rules };
  } else if (
    polygon.fillMode === FillMode.CATEGORIES &&
    polygon.categoryColumn &&
    classification?.colors?.length
  ) {
    const column = polygon.categoryColumn;
    columns.add(column);
    const patterns = resolvePolygonPatterns(
      classification,
      polygon.fillMode,
      notes
    );
    renderer = categoriesRenderer({
      column,
      classification,
      symbolFor: (hex, index) => {
        const pattern = patterns?.[index];
        return pattern
          ? fillSymbol(patternBackground, stroke, dataDefined, pattern)
          : fillSymbol(toRgba(hex, opacity), stroke, dataDefined);
      },
      missing: missingShows(missing, context, PrimitiveFilterType.POLYGON)
        ? {
            label: missing?.label ?? context.missingDataLabel,
            symbol: missingSymbol()
          }
        : null
    });
  } else {
    const patterns =
      polygon.fillMode === FillMode.UNIQUE
        ? resolvePolygonPatterns(classification, polygon.fillMode, notes)
        : null;
    const pattern = patterns?.[0];
    const color =
      polygon.fillMode === FillMode.NONE
        ? null
        : pattern
          ? patternBackground
          : toRgba(
              firstColor(polygon.fillColor ?? viz.style.fillColor),
              opacity
            );
    renderer = {
      type: 'single',
      symbol: fillSymbol(color, stroke, dataDefined, pattern ?? [])
    };
  }

  return {
    primitive: PrimitiveFilterType.POLYGON,
    geometry: 'polygon',
    columns: [...columns],
    style: { geometryType: 'polygon', renderer },
    notes
  };
}

function categoriesRenderer(options: {
  column: string;
  classification: ClassificationConfig;
  symbolFor: (hex: string | undefined, index: number) => QmlSymbol;
  missing: { label: string; symbol: QmlSymbol } | null;
  orderBy?: { expression: string; ascending: boolean };
}): QmlRenderer {
  const { column, classification } = options;
  const disabled = new Set((classification.disabledLabels ?? []).map(String));
  const categories: QmlCategory[] = categoryValues(classification).map(
    (value, index) => ({
      value,
      label: value,
      symbol: options.symbolFor(categoryColor(classification, index), index),
      render: !disabled.has(value)
    })
  );
  if (options.missing) {
    // QGIS matches a NULL attribute with the empty category value.
    categories.push({
      value: '',
      label: options.missing.label,
      symbol: options.missing.symbol,
      render: true
    });
  }
  return {
    type: 'categories',
    attribute: column,
    categories,
    orderBy: options.orderBy
  };
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

const QGIS_MARKER_SHAPES: Record<
  ShapeType,
  { name: string; sizeFactor: number }
> = {
  // QGIS size is a diameter or a bounding width; Khartis gives a radius.
  [ShapeType.CIRCLE]: { name: 'circle', sizeFactor: 2 },
  [ShapeType.SQUARE]: { name: 'square', sizeFactor: (2 * 0.6) / 0.7 },
  [ShapeType.DIAMOND]: { name: 'diamond', sizeFactor: 2 },
  [ShapeType.TRIANGLE]: {
    name: 'equilateral_triangle',
    sizeFactor: 4 / Math.sqrt(3)
  },
  [ShapeType.STAR]: { name: 'star', sizeFactor: 2 },
  [ShapeType.CROSS]: { name: 'cross_fill', sizeFactor: 2 },
  [ShapeType.RECTANGLE]: { name: 'rectangle', sizeFactor: 2 },
  [ShapeType.BAR]: { name: 'rectangle', sizeFactor: 2 },
  [ShapeType.SPIKE]: { name: 'triangle', sizeFactor: 2 }
};

const MISSING_SHAPES: Record<MissingDataShape, ShapeType> = {
  [MissingDataShape.CIRCLE]: ShapeType.CIRCLE,
  [MissingDataShape.CROSS]: ShapeType.CROSS,
  [MissingDataShape.SQUARE]: ShapeType.SQUARE
};

interface MarkerOptions {
  shape: ShapeType;
  /** Radius in page pixels, or an expression giving it. */
  radius: number | string;
  color: Rgba | null;
  fillExpression?: string;
  stroke: QmlStroke | null;
  barWidthPx: number;
}

const LEGEND_SYMBOL_SIZE_MM = 3;
const LEGEND_LINE_WIDTH_MM = 1;

function radiusMmExpression(radius: number | string): string {
  return typeof radius === 'number'
    ? qgisNumber(pxToMm(radius))
    : `(${radius}) * ${qgisNumber(MM_PER_PAGE_UNIT)}`;
}

function markerLayer(options: MarkerOptions): QmlSymbolLayer {
  const { shape, radius, color, stroke, fillExpression } = options;
  const dataDefined: DataDefinedProperties = {};
  if (fillExpression) {
    dataDefined.fillColor = fillExpression;
  }
  const radiusMm = radiusMmExpression(radius);

  if (isLinearShape(shape)) {
    // Bars and spikes stand on the point; their height is twice the radius.
    const widthPx =
      shape === ShapeType.SPIKE ? options.barWidthPx * 1.5 : options.barWidthPx;
    const heightMm = typeof radius === 'number' ? 2 * pxToMm(radius) : 0;
    if (typeof radius !== 'number') {
      dataDefined.height = `2 * ${radiusMm}`;
    }
    dataDefined.offset = `'0,' || to_string(-1 * ${radiusMm})`;
    return {
      kind: 'ellipse-marker',
      shape: shape === ShapeType.SPIKE ? 'triangle' : 'rectangle',
      widthMm: pxToMm(widthPx),
      heightMm,
      color,
      stroke,
      dataDefined
    };
  }

  if (shape === ShapeType.RECTANGLE) {
    const outer = typeof radius === 'number' ? radius / 0.7 : 0;
    if (typeof radius !== 'number') {
      dataDefined.width = `${radiusMm} * ${qgisNumber(1.8 / 0.7)}`;
      dataDefined.height = `${radiusMm} * ${qgisNumber(0.54 / 0.7)}`;
    }
    return {
      kind: 'ellipse-marker',
      shape: 'rectangle',
      widthMm: pxToMm(outer * 1.8),
      heightMm: pxToMm(outer * 0.54),
      color,
      stroke,
      dataDefined
    };
  }

  const { name, sizeFactor } =
    QGIS_MARKER_SHAPES[shape] ?? QGIS_MARKER_SHAPES[ShapeType.CIRCLE];
  if (typeof radius !== 'number') {
    dataDefined.size = `${qgisNumber(sizeFactor)} * ${radiusMm}`;
  }
  return {
    kind: 'marker',
    shape: name,
    // A size read from the data replaces it on the map; the legend draws
    // categories and classes at this one.
    sizeMm:
      typeof radius === 'number'
        ? sizeFactor * pxToMm(radius)
        : LEGEND_SYMBOL_SIZE_MM,
    color,
    stroke,
    dataDefined
  };
}

// What a size legend gives QGIS for a symbol of this radius: the marker
// size, or the height of a bar or a spike.
function legendSizeMm(shape: ShapeType, radius: number): number {
  return isLinearShape(shape)
    ? 2 * pxToMm(radius)
    : (QGIS_MARKER_SHAPES[shape] ?? QGIS_MARKER_SHAPES[ShapeType.CIRCLE])
        .sizeFactor * pxToMm(radius);
}

function markerSymbol(options: MarkerOptions): QmlSymbol {
  return { type: 'marker', opacity: 1, layers: [markerLayer(options)] };
}

/** Radius of a proportional symbol, in page pixels, as the map computes it. */
export function proportionalRadiusExpression(
  column: string,
  domainMax: number,
  maxRadius: number,
  scale: ScaleType
): string {
  const normalized = `min(1, abs(${qgisField(column)}) / ${qgisNumber(domainMax)})`;
  const factor =
    scale === ScaleType.LINEAR
      ? normalized
      : scale === ScaleType.LOG
        ? `ln(1 + ${normalized}) / ln(2)`
        : `sqrt(${normalized})`;
  return `coalesce(${factor} * ${qgisNumber(maxRadius)}, 0)`;
}

function classedSizes(
  minSize: number,
  maxSize: number,
  count: number
): number[] {
  if (count <= 1) {
    return [maxSize];
  }
  const step = (maxSize - minSize) / (count - 1);
  return Array.from({ length: count }, (_, index) => minSize + index * step);
}

function buildSymbolPlan(
  viz: VisualizationConfig,
  context: QgisStyleContext
): QgisLayerPlan | null {
  const symbol = getSymbolPrimitive(viz);
  if (!symbol?.enabled) {
    return null;
  }
  const notes: QgisExportNote[] = [];
  const columns = new Set<string>();
  const shape = symbol.shape ?? ShapeType.CIRCLE;
  if (shape !== ShapeType.CIRCLE) {
    notes.push({ code: 'symbol-shapes' });
  }
  const opacity = normalizeOpacity(symbol.opacity);
  const strokeOpacity = normalizeOpacity(symbol.strokeOpacity);
  const strokeWidthMm = pxToMm(
    (symbol.strokeWidth ?? 0) / SYMBOL_STROKE_WIDTH_DIVISOR
  );
  const stroke: QmlStroke | null =
    symbol.strokeMode !== StrokeMode.NONE &&
    strokeWidthMm > 0 &&
    strokeOpacity > 0
      ? {
          color: toRgba(
            firstColor(symbol.strokeColor),
            strokeOpacity,
            NEUTRAL_STROKE
          ),
          widthMm: strokeWidthMm,
          dashMm: dashMm(
            symbol.strokeDashed,
            symbol.strokeDashedPattern,
            strokeWidthMm
          )
        }
      : null;
  const barWidthPx = symbol.barWidth ?? 6;
  const uniqueRadius = Math.max(1, (symbol.size ?? 10) / 2);
  const minRadius = Math.max(1, symbol.minSize ?? 1);
  const maxRadius = Math.max(minRadius, symbol.maxSize ?? uniqueRadius);
  const pointClassification =
    getPrimitiveClassification(viz, PrimitiveFilterType.POINT) ??
    viz.classification;

  // Size channel.
  let radius: number | string = uniqueRadius;
  let sizeClasses: {
    column: string;
    intervals: ClassInterval[][];
    radii: number[];
    classification: ClassificationConfig;
  } | null = null;
  let sizeColumn: string | undefined;
  let doubleSymbols: DoubleSymbolRows | undefined;
  if (symbol.mode === SymbolMode.PROPORTIONAL && symbol.sizeColumn) {
    sizeColumn = symbol.sizeColumn;
    columns.add(sizeColumn);
    const domain = context.domain(PrimitiveFilterType.POINT, sizeColumn);
    const domainMax = domain
      ? Math.max(Math.abs(domain.min), Math.abs(domain.max))
      : NaN;
    const scale = isLinearShape(shape) ? ScaleType.LINEAR : ScaleType.SQRT;
    radius =
      Number.isFinite(domainMax) && domainMax > 0
        ? proportionalRadiusExpression(
            sizeColumn,
            domainMax,
            Math.max(0, symbol.maxSize ?? uniqueRadius),
            scale
          )
        : 0;
    if (
      symbol.proportionalType === ProportionalType.DOUBLE &&
      symbol.valueColumn &&
      Number.isFinite(domainMax)
    ) {
      // Both variables on one scale unless the map scales them apart.
      const secondary = context.domain(
        PrimitiveFilterType.POINT,
        symbol.valueColumn
      );
      const secondaryMax = secondary
        ? Math.max(Math.abs(secondary.min), Math.abs(secondary.max))
        : domainMax;
      const shared = symbol.commonScale !== false;
      const maxA = shared ? Math.max(domainMax, secondaryMax) : domainMax;
      const maxB = shared ? Math.max(domainMax, secondaryMax) : secondaryMax;
      const { roleField, valueField } = DOUBLE_SYMBOL_FIELDS;
      const radiusFor = (max: number) =>
        max > 0
          ? proportionalRadiusExpression(
              valueField,
              max,
              Math.max(0, symbol.maxSize ?? uniqueRadius),
              scale
            )
          : '0';
      radius = `CASE WHEN ${qgisField(roleField)} = 'A' THEN ${radiusFor(maxA)} ELSE ${radiusFor(maxB)} END`;
      doubleSymbols = {
        roleField,
        valueField,
        primary: sizeColumn,
        secondary: symbol.valueColumn
      };
      columns.add(symbol.valueColumn);
      if ((symbol.positionMode ?? 'overlay') !== 'overlay') {
        notes.push({ code: 'double-symbols', detail: symbol.valueColumn });
      }
    }
    if (symbol.knockout !== false && opacity < 1) {
      notes.push({ code: 'knockout' });
    }
  } else if (
    symbol.mode === SymbolMode.CLASSES &&
    symbol.valueColumn &&
    pointClassification?.breaks?.length
  ) {
    const intervals = classIntervals(pointClassification);
    if (intervals) {
      sizeColumn = symbol.valueColumn;
      columns.add(sizeColumn);
      const radii = classedSizes(minRadius, maxRadius, intervals.length);
      sizeClasses = {
        column: sizeColumn,
        intervals,
        radii,
        classification: pointClassification
      };
      radius = classCaseExpression(
        sizeColumn,
        intervals,
        radii.map(qgisNumber),
        qgisNumber(minRadius),
        kindOf(context, sizeColumn, pointClassification)
      );
    }
  }

  // Colour channel.
  const fillClassification =
    symbol.mode === SymbolMode.CATEGORIES
      ? pointClassification
      : (symbol.fillClassification ?? pointClassification);
  const fillValueColumn = symbol.fillValueColumn ?? symbol.valueColumn;
  const fillCategoryColumn =
    symbol.mode === SymbolMode.CATEGORIES
      ? symbol.categoryColumn
      : (symbol.fillCategoryColumn ?? symbol.categoryColumn);
  const uniqueColor =
    symbol.fillMode === FillMode.NONE
      ? null
      : toRgba(firstColor(symbol.fillColor), opacity);
  const signed =
    !doubleSymbols && Boolean(sizeColumn) && isSignedProportionalSymbol(viz);
  let fillExpression: string | undefined;
  const colorA = toRgba(firstColor(symbol.fillColor), opacity);
  const colorB = toRgba(symbol.fillColorB ?? '#ff832b', opacity);
  const uniqueFill =
    symbol.fillMode !== FillMode.CLASSES &&
    symbol.fillMode !== FillMode.CATEGORIES &&
    symbol.fillMode !== FillMode.NONE;
  if (doubleSymbols && uniqueFill) {
    // Each variable takes the other's colour below its break value.
    const role = qgisField(doubleSymbols.roleField);
    const value = qgisField(doubleSymbols.valueField);
    const swap = (
      breakValue: number | null | undefined,
      own: Rgba,
      other: Rgba
    ) =>
      typeof breakValue === 'number' && Number.isFinite(breakValue)
        ? `CASE WHEN ${value} < ${qgisNumber(breakValue)} THEN ${qgisColor(other)} ELSE ${qgisColor(own)} END`
        : qgisColor(own);
    fillExpression = `CASE WHEN ${role} = 'A' THEN ${swap(symbol.breakValueA, colorA, colorB)} ELSE ${swap(symbol.breakValueB, colorB, colorA)} END`;
  }
  if (signed && sizeColumn) {
    const [positive, negative] = resolveSymbolSignColors(viz);
    fillExpression = `CASE WHEN ${qgisField(sizeColumn)} < 0 THEN ${qgisColor(toRgba(negative, opacity))} ELSE ${qgisColor(toRgba(positive, opacity))} END`;
  }

  const missing = symbol.missingData;
  const missingColumn =
    doubleSymbols?.valueField ??
    sizeColumn ??
    (symbol.fillMode === FillMode.CLASSES
      ? fillValueColumn
      : fillCategoryColumn);
  const missingSymbol = missingShows(
    missing,
    context,
    PrimitiveFilterType.POINT
  )
    ? markerSymbol({
        shape:
          MISSING_SHAPES[missing?.shape ?? MissingDataShape.CIRCLE] ??
          ShapeType.CIRCLE,
        radius: Math.max(1, missing?.size ?? uniqueRadius),
        color: toRgba(missing?.color ?? DEFAULT_COLORS.missingData, opacity),
        stroke,
        barWidthPx
      })
    : null;
  const missingLabel = missing?.label ?? context.missingDataLabel;
  const orderBy =
    typeof radius === 'string'
      ? { expression: radius, ascending: false }
      : undefined;
  const symbolWith = (
    color: Rgba | null,
    radiusValue: number | string = radius
  ) =>
    markerSymbol({
      shape,
      radius: radiusValue,
      color,
      fillExpression,
      stroke,
      barWidthPx
    });

  let renderer: QmlRenderer;
  let colorIsUnique = false;
  let sizeClassesListed = false;
  if (doubleSymbols && uniqueFill) {
    const role = qgisField(doubleSymbols.roleField);
    const value = qgisField(doubleSymbols.valueField);
    renderer = {
      type: 'rules',
      rules: [
        {
          filter: `${role} = 'A' AND ${value} IS NOT NULL`,
          label: doubleSymbols.primary,
          symbol: symbolWith(colorA)
        },
        {
          filter: `${role} = 'B' AND ${value} IS NOT NULL`,
          label: doubleSymbols.secondary,
          symbol: symbolWith(colorB)
        },
        ...(missingSymbol
          ? [
              {
                filter: `${value} IS NULL`,
                label: missingLabel,
                symbol: missingSymbol
              }
            ]
          : [])
      ],
      orderBy
    };
  } else if (
    !signed &&
    (symbol.mode === SymbolMode.CATEGORIES ||
      symbol.fillMode === FillMode.CATEGORIES) &&
    fillCategoryColumn &&
    fillClassification?.colors?.length
  ) {
    columns.add(fillCategoryColumn);
    const shapeMode =
      symbol.mode === SymbolMode.CATEGORIES
        ? (symbol.categoryShape ?? CategoryShapeMode.UNIQUE)
        : CategoryShapeMode.UNIQUE;
    const categoryCount = categoryValues(fillClassification).length;
    // Same shapes and ranks as the map (`resolveCategoryShapeMaps`).
    const categoryShape = (index: number): ShapeType => {
      if (
        shapeMode === CategoryShapeMode.UNIQUE ||
        shapeMode === CategoryShapeMode.ORDERED
      ) {
        return shape;
      }
      return (
        fillClassification.categoryShapes?.[index] ??
        CATEGORY_SHAPE_CYCLE[index % CATEGORY_SHAPE_CYCLE.length] ??
        ShapeType.CIRCLE
      );
    };
    const categoryRadius = (index: number): number | string => {
      if (shapeMode !== CategoryShapeMode.ORDERED) {
        return radius;
      }
      const rMin = Math.max(1, minRadius);
      const rMax = Math.max(rMin, maxRadius);
      const t = categoryCount <= 1 ? 0 : index / (categoryCount - 1);
      return rMin + t * (rMax - rMin);
    };
    if (shapeMode === CategoryShapeMode.DIFFERENT) {
      notes.push({ code: 'symbol-shapes' });
    }
    renderer = categoriesRenderer({
      column: fillCategoryColumn,
      classification: fillClassification,
      symbolFor: (hex, index) =>
        markerSymbol({
          shape: categoryShape(index),
          radius: categoryRadius(index),
          color: toRgba(hex, opacity),
          stroke,
          barWidthPx
        }),
      missing:
        missingSymbol && missingColumn === fillCategoryColumn
          ? { label: missingLabel, symbol: missingSymbol }
          : null,
      orderBy
    });
  } else if (
    !signed &&
    symbol.fillMode === FillMode.CLASSES &&
    fillValueColumn &&
    fillClassification?.breaks?.length &&
    fillClassification.colors?.length
  ) {
    columns.add(fillValueColumn);
    if (hasPattern(fillClassification)) {
      notes.push({ code: 'pattern-fill' });
    }
    const intervals = classIntervals(fillClassification) ?? [];
    const rules: QmlRule[] = intervals.flatMap((list, index) => {
      const filter = classFilterExpression(
        fillValueColumn,
        list,
        kindOf(context, fillValueColumn, fillClassification)
      );
      return filter
        ? [
            {
              filter,
              label: classLabel(fillClassification, list, index, context),
              symbol: symbolWith(
                toRgba(fillClassification.colors?.[index], opacity)
              )
            }
          ]
        : [];
    });
    if (missingSymbol && missingColumn) {
      rules.push({
        filter: missingFilter(missingColumn),
        label: missingLabel,
        symbol: missingSymbol
      });
    }
    renderer = { type: 'rules', rules, orderBy };
  } else if (sizeClasses) {
    sizeClassesListed = true;
    const { column, intervals, radii, classification } = sizeClasses;
    const rules: QmlRule[] = intervals.flatMap((list, index) => {
      const filter = classFilterExpression(
        column,
        list,
        kindOf(context, column, classification)
      );
      return filter
        ? [
            {
              filter,
              label: classLabel(classification, list, index, context),
              symbol: symbolWith(uniqueColor, radii[index])
            }
          ]
        : [];
    });
    if (missingSymbol) {
      rules.push({
        filter: missingFilter(column),
        label: missingLabel,
        symbol: missingSymbol
      });
    }
    renderer = { type: 'rules', rules, orderBy };
  } else if (sizeColumn && missingSymbol) {
    colorIsUnique = true;
    renderer = {
      type: 'rules',
      rules: [
        {
          filter: `${qgisField(sizeColumn)} IS NOT NULL`,
          label: sizeColumn,
          symbol: symbolWith(uniqueColor)
        },
        {
          filter: missingFilter(sizeColumn),
          label: missingLabel,
          symbol: missingSymbol
        }
      ],
      orderBy
    };
  } else {
    colorIsUnique = true;
    renderer = { type: 'single', symbol: symbolWith(uniqueColor), orderBy };
  }

  // Colour drawn from another variable: the classed sizes get a legend of
  // their own, largest first as Khartis lists them.
  if (sizeClasses && !sizeClassesListed && renderer.type !== 'null') {
    const { intervals, radii, classification } = sizeClasses;
    renderer = {
      ...renderer,
      sizeLegend: {
        title: '',
        classes: intervals
          .map((list, index) => ({
            label: classLabel(classification, list, index, context),
            sizeMm: legendSizeMm(shape, radii[index])
          }))
          .reverse(),
        neutral: true
      }
    };
  }

  return {
    primitive: PrimitiveFilterType.POINT,
    doubleSymbols,
    geometry: 'point',
    columns: [...columns],
    style: { geometryType: 'point', renderer },
    notes,
    proportionalSize: Boolean(sizeColumn) && !sizeClasses && !doubleSymbols,
    uniqueColor: colorIsUnique
  };
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

function buildLinePlan(
  viz: VisualizationConfig,
  context: QgisStyleContext
): QgisLayerPlan | null {
  const line = getLinePrimitive(viz);
  if (!line?.enabled) {
    return null;
  }
  const columns = new Set<string>();
  const opacity = normalizeOpacity(line.opacity);
  const baseWidthPx = line.width ?? 1;
  const maxWidthPx = line.maxWidth ?? baseWidthPx;
  const colorClassification =
    getPrimitiveClassification(viz, PrimitiveFilterType.LINE) ??
    viz.classification;
  const thicknessClassification = getLineThicknessClassification(viz);
  const dataDefined: DataDefinedProperties = {};

  let widthPx: number | string = Math.max(1, baseWidthPx);
  let thicknessClasses: {
    column: string;
    intervals: ClassInterval[][];
    widths: number[];
    classification: ClassificationConfig;
  } | null = null;
  if (line.thicknessMode === ThicknessMode.PROPORTIONAL && line.sizeColumn) {
    columns.add(line.sizeColumn);
    const domain = context.domain(PrimitiveFilterType.LINE, line.sizeColumn);
    const domainMax = domain
      ? Math.max(Math.abs(domain.min), Math.abs(domain.max))
      : NaN;
    widthPx =
      Number.isFinite(domainMax) && domainMax > 0
        ? proportionalRadiusExpression(
            line.sizeColumn,
            domainMax,
            maxWidthPx,
            ScaleType.LINEAR
          )
        : 0;
  } else if (line.thicknessMode === ThicknessMode.CLASSES && line.valueColumn) {
    const intervals = classIntervals(thicknessClassification);
    if (intervals && thicknessClassification) {
      columns.add(line.valueColumn);
      const widths = classedSizes(1, maxWidthPx, intervals.length);
      thicknessClasses = {
        column: line.valueColumn,
        intervals,
        widths,
        classification: thicknessClassification
      };
      widthPx = classCaseExpression(
        line.valueColumn,
        intervals,
        widths.map(qgisNumber),
        '1',
        kindOf(context, line.valueColumn, thicknessClassification)
      );
    }
  }
  if (typeof widthPx === 'string') {
    dataDefined.outlineWidth = `(${widthPx}) * ${qgisNumber(MM_PER_PAGE_UNIT)}`;
  }
  // A width read from the data replaces it on the map; the legend draws
  // categories and classes at this one.
  const widthMm =
    typeof widthPx === 'number' ? pxToMm(widthPx) : LEGEND_LINE_WIDTH_MM;
  const strokeFor = (hex: string | undefined): QmlStroke => ({
    color: toRgba(hex, opacity, NEUTRAL_STROKE),
    widthMm,
    dashMm: dashMm(line.dashed, line.dashedPattern, widthMm),
    cap: line.capRounded === false ? 'flat' : 'round'
  });
  const lineSymbol = (hex: string | undefined): QmlSymbol => ({
    type: 'line',
    opacity: 1,
    layers: [{ kind: 'line', stroke: strokeFor(hex), dataDefined }]
  });
  const missing = line.missingData;
  const missingLabel = missing?.label ?? context.missingDataLabel;
  const orderBy =
    typeof widthPx === 'string'
      ? { expression: widthPx, ascending: true }
      : undefined;

  let renderer: QmlRenderer;
  let thicknessListed = false;
  if (
    line.colorMode === ColorMode.CLASSES &&
    line.valueColumn &&
    colorClassification?.breaks?.length &&
    colorClassification.colors?.length
  ) {
    const column = line.valueColumn;
    columns.add(column);
    const intervals = classIntervals(colorClassification) ?? [];
    const rules: QmlRule[] = intervals.flatMap((list, index) => {
      const filter = classFilterExpression(
        column,
        list,
        kindOf(context, column, colorClassification)
      );
      return filter
        ? [
            {
              filter,
              label: classLabel(colorClassification, list, index, context),
              symbol: lineSymbol(colorClassification.colors?.[index])
            }
          ]
        : [];
    });
    if (missingShows(missing, context, PrimitiveFilterType.LINE)) {
      rules.push({
        filter: missingFilter(column),
        label: missingLabel,
        symbol: lineSymbol(missing?.color ?? DEFAULT_COLORS.missingData)
      });
    }
    renderer = { type: 'rules', rules, orderBy };
  } else if (
    line.colorMode === ColorMode.CATEGORIES &&
    line.categoryColumn &&
    colorClassification?.colors?.length
  ) {
    columns.add(line.categoryColumn);
    renderer = categoriesRenderer({
      column: line.categoryColumn,
      classification: colorClassification,
      symbolFor: (hex) => lineSymbol(hex),
      missing: missingShows(missing, context, PrimitiveFilterType.LINE)
        ? {
            label: missingLabel,
            symbol: lineSymbol(missing?.color ?? DEFAULT_COLORS.missingData)
          }
        : null,
      orderBy
    });
  } else if (thicknessClasses) {
    thicknessListed = true;
    // One entry per class, at its width, as the Khartis legend lists them.
    const { column, intervals, widths, classification } = thicknessClasses;
    const color = firstColor(line.color) ?? firstColor(viz.style.lineColor);
    const rules: QmlRule[] = intervals.flatMap((list, index) => {
      const filter = classFilterExpression(
        column,
        list,
        kindOf(context, column, classification)
      );
      return filter
        ? [
            {
              filter,
              label: classLabel(classification, list, index, context),
              symbol: {
                type: 'line',
                opacity: 1,
                layers: [
                  {
                    kind: 'line',
                    stroke: {
                      ...strokeFor(color),
                      widthMm: pxToMm(widths[index])
                    }
                  }
                ]
              }
            }
          ]
        : [];
    });
    if (missingShows(missing, context, PrimitiveFilterType.LINE)) {
      rules.push({
        filter: missingFilter(column),
        label: missingLabel,
        symbol: lineSymbol(missing?.color ?? DEFAULT_COLORS.missingData)
      });
    }
    renderer = { type: 'rules', rules, orderBy };
  } else {
    renderer = {
      type: 'single',
      symbol: lineSymbol(
        firstColor(line.color) ?? firstColor(viz.style.lineColor)
      ),
      orderBy
    };
  }

  // Colour drawn from another variable: the classed widths get a legend of
  // their own.
  if (thicknessClasses && !thicknessListed && renderer.type !== 'null') {
    const { intervals, widths, classification } = thicknessClasses;
    renderer = {
      ...renderer,
      sizeLegend: {
        title: '',
        classes: intervals.map((list, index) => ({
          label: classLabel(classification, list, index, context),
          sizeMm: pxToMm(widths[index])
        })),
        neutral: true
      }
    };
  }

  return {
    primitive: PrimitiveFilterType.LINE,
    geometry: 'line',
    columns: [...columns],
    style: { geometryType: 'line', renderer },
    notes: [],
    proportionalSize:
      line.thicknessMode === ThicknessMode.PROPORTIONAL &&
      typeof widthPx === 'string',
    uniqueColor: renderer.type === 'single'
  };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function textColorExpression(
  config: {
    colorMode: ColorMode;
    valueColumn?: string;
    categoryColumn?: string;
    classification?: ClassificationConfig;
  },
  opacity: number,
  fallback: Rgba,
  columns: Set<string>,
  kindFor: (column: string) => ClassValueKind
): string | undefined {
  const { classification } = config;
  if (!classification?.colors?.length) {
    return undefined;
  }
  if (config.colorMode === ColorMode.CLASSES && config.valueColumn) {
    columns.add(config.valueColumn);
    return colorExpression({
      mode: 'classes',
      column: config.valueColumn,
      classification,
      opacity,
      fallback: qgisColor(fallback),
      kind: kindFor(config.valueColumn)
    });
  }
  if (config.colorMode === ColorMode.CATEGORIES && config.categoryColumn) {
    columns.add(config.categoryColumn);
    return colorExpression({
      mode: 'categories',
      column: config.categoryColumn,
      classification,
      opacity,
      fallback: qgisColor(fallback)
    });
  }
  return undefined;
}

function buildTextPlan(
  viz: VisualizationConfig,
  context: QgisStyleContext
): QgisLayerPlan | null {
  const text = getTextPrimitive(viz);
  const labelColumn = text?.labelColumn;
  if (!text?.enabled || !labelColumn) {
    return null;
  }
  const notes: QgisExportNote[] = [{ code: 'label-placement' }];
  const columns = new Set<string>([labelColumn]);
  const opacity = normalizeOpacity(text.opacity);
  const color = toRgba(firstColor(text.color), opacity, '#000000');
  const dataDefined: DataDefinedProperties = {};
  const textClassification =
    text.classification ??
    getPrimitiveClassification(viz, PrimitiveFilterType.TEXT);
  const colorDd = textColorExpression(
    {
      colorMode: text.colorMode,
      valueColumn: text.valueColumn,
      categoryColumn: text.categoryColumn,
      classification: textClassification
    },
    opacity,
    color,
    columns,
    (column) => kindOf(context, column, textClassification)
  );
  if (colorDd) {
    dataDefined.Color = colorDd;
  }
  if (text.sizeMode === SizeMode.CLASSES && text.valueColumn) {
    const sizeClassification =
      text.sizeModeStates?.[SizeMode.CLASSES]?.classification ??
      textClassification;
    const intervals = classIntervals(sizeClassification);
    if (intervals) {
      columns.add(text.valueColumn);
      const sizes = (
        sizeClassification?.categorySizes?.length === intervals.length
          ? sizeClassification.categorySizes
          : classedSizes(
              Math.max(6, text.size * 0.6),
              text.size,
              intervals.length
            )
      ).map((px) => qgisNumber(px * PT_PER_PAGE_UNIT));
      dataDefined.Size = classCaseExpression(
        text.valueColumn,
        intervals,
        sizes,
        qgisNumber(text.size * PT_PER_PAGE_UNIT),
        kindOf(context, text.valueColumn, sizeClassification)
      );
    }
  }

  const fonts = new Set<string>([text.fontFamily]);
  const haloOf = (
    enabled: boolean,
    haloColor: string | undefined,
    widthPx: number,
    haloOpacity: number
  ) =>
    enabled && widthPx > 0
      ? {
          sizeMm: pxToMm(widthPx),
          color: toRgba(haloColor ?? '#ffffff', haloOpacity, '#ffffff')
        }
      : null;
  const primarySizePx = text.size;
  const secondary = text.secondaryLabels;
  const showSecondary = Boolean(
    secondary?.enabled &&
    secondary.labelColumn &&
    normalizeOpacity(secondary.opacity) > 0
  );
  const secondarySizePx = showSecondary ? secondary.size : 0;
  // The two labels stack around the anchor, as on the map.
  const gapPx = showSecondary ? LINE_GAP_PX : 0;
  const primaryUpMm = showSecondary ? pxToMm((secondarySizePx + gapPx) / 2) : 0;

  const labels: QmlLabelRule[] = [
    {
      expression: qgisField(labelColumn),
      description: labelColumn,
      format: {
        fontFamily: text.fontFamily,
        sizePt: primarySizePx * PT_PER_PAGE_UNIT,
        color,
        bold: text.bold,
        italic: text.italic,
        buffer: haloOf(
          text.halo,
          text.haloColor,
          text.haloWidth,
          normalizeOpacity(text.haloOpacity)
        ),
        dataDefined
      },
      offsetUpMm: primaryUpMm,
      align: text.align,
      allowOverlap: !text.collisionDetection
    }
  ];
  if (showSecondary && secondary.labelColumn) {
    columns.add(secondary.labelColumn);
    fonts.add(secondary.fontFamily);
    const secondaryOpacity = normalizeOpacity(secondary.opacity);
    labels.push({
      expression: qgisField(secondary.labelColumn),
      description: secondary.labelColumn,
      format: {
        fontFamily: secondary.fontFamily,
        sizePt: secondarySizePx * PT_PER_PAGE_UNIT,
        color: toRgba(firstColor(secondary.color), secondaryOpacity, '#000000'),
        bold: secondary.bold,
        italic: secondary.italic,
        buffer: haloOf(
          secondary.halo,
          secondary.haloColor,
          secondary.haloWidth,
          normalizeOpacity(secondary.haloOpacity)
        )
      },
      offsetUpMm: -pxToMm((primarySizePx + gapPx) / 2),
      align: secondary.align,
      allowOverlap: !secondary.collisionDetection
    });
  }
  fonts.forEach((font) => notes.push({ code: 'font', detail: font }));

  return {
    primitive: PrimitiveFilterType.TEXT,
    geometry: 'point',
    columns: [...columns],
    style: { geometryType: 'point', renderer: { type: 'null' }, labels },
    notes
  };
}

/**
 * The QGIS layers that redraw a visualization, one per enabled primitive,
 * listed from the bottom of the map to the top.
 */
export function buildVisualizationLayerPlans(
  viz: VisualizationConfig,
  context: QgisStyleContext,
  primitiveOrder: readonly PrimitiveFilter[]
): QgisLayerPlan[] {
  const plans = [
    buildPolygonPlan(viz, context),
    buildLinePlan(viz, context),
    buildSymbolPlan(viz, context),
    buildTextPlan(viz, context)
  ].filter((plan): plan is QgisLayerPlan => plan !== null);
  const rank = (primitive: PrimitiveFilter) => {
    const index = primitiveOrder.indexOf(primitive);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  // The first primitive of the order is drawn on top.
  return plans.sort(
    (left, right) => rank(right.primitive) - rank(left.primitive)
  );
}

// ---------------------------------------------------------------------------
// Basemap
// ---------------------------------------------------------------------------

export interface BasemapFillStyle {
  fillColor: string;
  /** 0 to 100, as the basemap panel stores it. */
  fillOpacity: number;
  stroke: BasemapLineStyle | null;
}

export interface BasemapLineStyle {
  color: string;
  /** Page pixels. */
  thickness: number;
  /** 0 to 100. */
  opacity: number;
  dotted: boolean;
  dottedPattern?: BasemapDottedPattern;
}

function basemapStroke(style: BasemapLineStyle): QmlStroke | null {
  if (style.thickness <= 0 || style.opacity <= 0) {
    return null;
  }
  const widthMm = pxToMm(style.thickness);
  return {
    color: toRgba(style.color, style.opacity / 100, NEUTRAL_STROKE),
    widthMm,
    dashMm: dashMm(style.dotted, style.dottedPattern, widthMm),
    cap: 'round'
  };
}

/** A basemap polygon layer (land, lakes) styled as the basemap panel sets it. */
export function buildBasemapFillPlan(style: BasemapFillStyle): QgisLayerPlan {
  const stroke = style.stroke ? basemapStroke(style.stroke) : null;
  return {
    primitive: PrimitiveFilterType.POLYGON,
    geometry: 'polygon',
    columns: [],
    style: {
      geometryType: 'polygon',
      renderer: {
        type: 'single',
        symbol: fillSymbol(
          toRgba(style.fillColor, style.fillOpacity / 100),
          stroke,
          {}
        )
      }
    },
    notes: []
  };
}

/** A basemap line layer (borders, rivers). */
export function buildBasemapLinePlan(
  style: BasemapLineStyle
): QgisLayerPlan | null {
  const stroke = basemapStroke(style);
  if (!stroke) {
    return null;
  }
  return {
    primitive: PrimitiveFilterType.LINE,
    geometry: 'line',
    columns: [],
    style: {
      geometryType: 'line',
      renderer: {
        type: 'single',
        symbol: { type: 'line', opacity: 1, layers: [{ kind: 'line', stroke }] }
      }
    },
    notes: []
  };
}

// ---------------------------------------------------------------------------
// Labels edited on the map
// ---------------------------------------------------------------------------

/** Attributes holding the texts typed and the positions dragged in Khartis. */
export interface LabelEditFields {
  primary: string;
  secondary?: string;
  /** Centre of the label block from the anchor, millimetres, y down. */
  dx: string;
  dy: string;
}

/**
 * Points the labels at the edited texts, and moves the dragged ones where
 * the map shows them. A label without an edit keeps its data value and its
 * place: a NULL data-defined offset falls back to the static one.
 */
export function withLabelEdits(
  plan: QgisLayerPlan,
  fields: LabelEditFields
): QgisLayerPlan {
  const labels = plan.style.labels?.map((label, index) => {
    const field = index === 0 ? fields.primary : fields.secondary;
    const dx = qgisField(fields.dx);
    const dy = qgisField(fields.dy);
    return {
      ...label,
      expression: field ? qgisField(field) : label.expression,
      format: {
        ...label.format,
        dataDefined: {
          ...label.format.dataDefined,
          // Both labels stack around the dragged centre, as on the map.
          OffsetXY: `CASE WHEN ${dx} IS NULL THEN NULL ELSE array(${dx}, ${dy} - ${qgisNumber(label.offsetUpMm)}) END`,
          OffsetQuad: `CASE WHEN ${dx} IS NULL THEN NULL ELSE 4 END`
        }
      }
    };
  });
  return {
    ...plan,
    columns: [
      ...plan.columns,
      ...[fields.primary, fields.secondary, fields.dx, fields.dy].filter(
        (field): field is string => Boolean(field)
      )
    ],
    style: { ...plan.style, labels }
  };
}

// ---------------------------------------------------------------------------
// Dot density
// ---------------------------------------------------------------------------

/**
 * The dots of a dot-density fill, as the map draws them: one colour, a
 * radius in page pixels. Null unless the polygons are drawn in density.
 */
export function buildDensityPlan(
  viz: VisualizationConfig
): QgisLayerPlan | null {
  const polygon = getPolygonPrimitive(viz);
  if (
    !polygon?.enabled ||
    polygon.fillMode !== FillMode.DENSITY ||
    !viz.density?.valueColumn
  ) {
    return null;
  }
  const radius = Math.max(0.1, viz.density.dotSize ?? DENSITY_DEFAULTS.dotSize);
  return {
    primitive: PrimitiveFilterType.POLYGON,
    geometry: 'point',
    columns: [],
    style: {
      geometryType: 'point',
      renderer: {
        type: 'single',
        symbol: markerSymbol({
          shape: ShapeType.CIRCLE,
          radius,
          color: toRgba(
            viz.density.color ?? DENSITY_DEFAULTS.color,
            normalizeOpacity(viz.style.fillOpacity)
          ),
          stroke: null,
          barWidthPx: 0
        })
      }
    },
    notes: []
  };
}
