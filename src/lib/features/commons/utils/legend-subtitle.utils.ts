import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import {
  ColorMode,
  FillMode,
  ProportionalType,
  SizeMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import { isSignedProportionalSymbol } from './symbol-sign.utils';

export function joinLegendSubtitleParts(
  parts: Array<string | null | undefined>
): string {
  const unique: string[] = [];

  for (const part of parts) {
    const normalized = part?.trim();
    if (!normalized || unique.includes(normalized)) {
      continue;
    }

    unique.push(normalized);
  }

  return unique.join(' / ');
}

export function getVisualizationLegendSubtitleParts(
  visualization: VisualizationConfig
): Array<string | undefined> {
  const symbolEnabled = Boolean(visualization.symbol?.enabled);
  const polygonEnabled = Boolean(visualization.polygon?.enabled);
  const lineEnabled = Boolean(visualization.line?.enabled);
  const textEnabled = Boolean(visualization.text?.enabled);

  if (symbolEnabled && !polygonEnabled && !lineEnabled && !textEnabled) {
    return getPointLegendSubtitleParts(visualization);
  }

  if (polygonEnabled && !symbolEnabled && !lineEnabled && !textEnabled) {
    return getPolygonLegendSubtitleParts(visualization);
  }

  if (lineEnabled && !symbolEnabled && !polygonEnabled && !textEnabled) {
    return getLineLegendSubtitleParts(visualization);
  }

  if (textEnabled && !symbolEnabled && !polygonEnabled && !lineEnabled) {
    return getTextLegendSubtitleParts(visualization);
  }

  return visualization.modes?.fill === 'categories'
    ? [
        visualization.mapping.categoryColumn,
        visualization.mapping.valueColumn,
        visualization.mapping.sizeColumn,
        visualization.mapping.colorColumn
      ]
    : [
        visualization.mapping.sizeColumn,
        visualization.mapping.valueColumn,
        visualization.mapping.categoryColumn,
        visualization.mapping.colorColumn
      ];
}

function getPolygonLegendSubtitleParts(
  visualization: VisualizationConfig
): Array<string | undefined> {
  const polygonFillMode = visualization.polygon?.fillMode;
  const polygonValueColumn =
    visualization.polygon?.valueColumn ?? visualization.mapping.valueColumn;
  const polygonCategoryColumn =
    visualization.polygon?.categoryColumn ??
    visualization.mapping.categoryColumn;

  const strokeColumn = getStrokeColumn(visualization.polygon);

  if (polygonFillMode === FillMode.CATEGORIES) {
    return [polygonCategoryColumn, polygonValueColumn, strokeColumn];
  }

  if (
    polygonFillMode === FillMode.CLASSES ||
    polygonFillMode === FillMode.DENSITY
  ) {
    return [polygonValueColumn, strokeColumn];
  }

  if (strokeColumn) {
    return [strokeColumn];
  }

  return [polygonValueColumn, polygonCategoryColumn];
}

function getStrokeColumn(
  primitive:
    | {
        strokeMode?: StrokeMode;
        strokeValueColumn?: string;
        strokeCategoryColumn?: string;
        valueColumn?: string;
        categoryColumn?: string;
      }
    | undefined
): string | undefined {
  if (primitive?.strokeMode === StrokeMode.CLASSES) {
    return primitive.strokeValueColumn ?? primitive.valueColumn;
  }
  if (primitive?.strokeMode === StrokeMode.CATEGORIES) {
    return primitive.strokeCategoryColumn ?? primitive.categoryColumn;
  }
  return undefined;
}

function getTextLegendSubtitleParts(
  visualization: VisualizationConfig
): Array<string | undefined> {
  return visualization.text?.colorMode === 'categories'
    ? [
        visualization.text?.categoryColumn,
        visualization.text?.valueColumn,
        visualization.text?.labelColumn
      ]
    : [
        visualization.text?.valueColumn,
        visualization.text?.categoryColumn,
        visualization.text?.labelColumn
      ];
}

export type LegendSubtitlePrimitive = 'point' | 'area' | 'line' | 'text';

// Background to foreground, so the legend frames stack the way the map does.
const LEGEND_PRIMITIVE_ORDER: LegendSubtitlePrimitive[] = [
  'area',
  'line',
  'point',
  'text'
];

// Labels at a single size and a single colour encode nothing: the words on the
// map already say what they mean, so they get no legend frame. Every other
// primitive keeps one even in unique mode — its mark still needs naming.
function doesTextEncodeVariable(visualization: VisualizationConfig): boolean {
  const text = visualization.text;
  if (!text) {
    return false;
  }

  const sizeEncodes =
    (text.sizeMode === SizeMode.PROPORTIONAL ||
      text.sizeMode === SizeMode.CLASSES) &&
    Boolean(text.valueColumn ?? visualization.mapping.valueColumn);
  const colorEncodes =
    text.colorMode === ColorMode.CLASSES ||
    text.colorMode === ColorMode.CATEGORIES;

  return sizeEncodes || colorEncodes;
}

/**
 * The primitives that own a legend for this visualization. Derived from the
 * configuration alone: whether a primitive actually draws something is decided
 * by the render layer, which skips empty frames.
 */
export function getEnabledLegendPrimitives(
  visualization: VisualizationConfig
): LegendSubtitlePrimitive[] {
  const enabled: Record<LegendSubtitlePrimitive, boolean> = {
    area: Boolean(visualization.polygon?.enabled),
    line: Boolean(visualization.line?.enabled),
    point: Boolean(visualization.symbol?.enabled),
    text:
      Boolean(visualization.text?.enabled) &&
      doesTextEncodeVariable(visualization)
  };

  return LEGEND_PRIMITIVE_ORDER.filter((primitive) => enabled[primitive]);
}

export function getPrimitiveLegendSubtitle(
  visualization: VisualizationConfig,
  primitive: LegendSubtitlePrimitive
): string {
  switch (primitive) {
    case 'point':
      return joinLegendSubtitleParts(
        getPointLegendSubtitleParts(visualization)
      );
    case 'area':
      return joinLegendSubtitleParts(
        getPolygonLegendSubtitleParts(visualization)
      );
    case 'line':
      return joinLegendSubtitleParts(getLineLegendSubtitleParts(visualization));
    case 'text':
      return joinLegendSubtitleParts(getTextLegendSubtitleParts(visualization));
  }
}

export function getVisualizationLegendSubtitle(
  visualization: VisualizationConfig
): string {
  return joinLegendSubtitleParts(
    getVisualizationLegendSubtitleParts(visualization)
  );
}

function getPointLegendSubtitleParts(
  visualization: VisualizationConfig
): Array<string | undefined> {
  const symbol = visualization.symbol;
  if (!symbol?.enabled) {
    return [];
  }

  const parts: Array<string | undefined> = [];

  if (
    symbol.mode === SymbolMode.PROPORTIONAL ||
    symbol.mode === SymbolMode.CLASSES
  ) {
    parts.push(symbol.sizeColumn ?? visualization.mapping.sizeColumn);
  } else if (symbol.mode === SymbolMode.CATEGORIES) {
    parts.push(symbol.categoryColumn ?? visualization.mapping.categoryColumn);
  }

  if (symbol.proportionalType === ProportionalType.DOUBLE) {
    parts.push(symbol.valueColumn ?? visualization.mapping.valueColumn);
  }

  // A sign fill reads the size column, already named above.
  const fillMode = isSignedProportionalSymbol(visualization)
    ? undefined
    : symbol.fillMode;
  if (fillMode === FillMode.CATEGORIES) {
    parts.unshift(
      symbol.fillCategoryColumn ??
        visualization.mapping.colorColumn ??
        visualization.mapping.categoryColumn
    );
  } else if (fillMode === FillMode.CLASSES) {
    parts.push(
      symbol.fillValueColumn ??
        visualization.mapping.colorColumn ??
        visualization.mapping.valueColumn
    );
  }

  parts.push(getStrokeColumn(symbol));

  return parts;
}

function getLineLegendSubtitleParts(
  visualization: VisualizationConfig
): Array<string | undefined> {
  const line = visualization.line;
  if (!line?.enabled) {
    return [];
  }

  const parts: Array<string | undefined> = [];

  if (
    line.thicknessMode === ThicknessMode.PROPORTIONAL ||
    line.thicknessMode === ThicknessMode.CLASSES
  ) {
    parts.push(line.sizeColumn ?? visualization.mapping.sizeColumn);
  }

  if (line.colorMode === ColorMode.CATEGORIES) {
    parts.unshift(line.categoryColumn ?? visualization.mapping.categoryColumn);
  } else if (line.colorMode === ColorMode.CLASSES) {
    parts.push(
      line.valueColumn ??
        visualization.mapping.colorColumn ??
        visualization.mapping.valueColumn
    );
  }

  return parts;
}

/**
 * A channel of a primitive that encodes a variable: its color (fill for
 * polygons and symbols), its outline, or its size (thickness for lines).
 */
export type LegendComponent = 'color' | 'stroke' | 'size';

const CLASSED_OR_CATEGORICAL_STROKE: ReadonlySet<StrokeMode | undefined> =
  new Set([StrokeMode.CLASSES, StrokeMode.CATEGORIES]);
const CLASSED_OR_CATEGORICAL_COLOR: ReadonlySet<ColorMode | undefined> =
  new Set([ColorMode.CLASSES, ColorMode.CATEGORIES]);

function getComponentColumns(
  visualization: VisualizationConfig,
  primitive: LegendSubtitlePrimitive
): Partial<Record<LegendComponent, Array<string | undefined>>> {
  const mapping = visualization.mapping;

  switch (primitive) {
    case 'area': {
      const polygon = visualization.polygon;
      const columns: Partial<
        Record<LegendComponent, Array<string | undefined>>
      > = {};
      if (polygon?.fillMode === FillMode.CATEGORIES) {
        columns.color = [polygon.categoryColumn ?? mapping.categoryColumn];
      } else if (
        polygon?.fillMode === FillMode.CLASSES ||
        polygon?.fillMode === FillMode.DENSITY
      ) {
        columns.color = [polygon.valueColumn ?? mapping.valueColumn];
      }
      if (CLASSED_OR_CATEGORICAL_STROKE.has(polygon?.strokeMode)) {
        columns.stroke = [getStrokeColumn(polygon)];
      }
      return columns;
    }
    case 'point': {
      const symbol = visualization.symbol;
      const columns: Partial<
        Record<LegendComponent, Array<string | undefined>>
      > = {};
      if (
        symbol?.mode === SymbolMode.PROPORTIONAL ||
        symbol?.mode === SymbolMode.CLASSES
      ) {
        columns.size = [
          symbol.sizeColumn ?? mapping.sizeColumn,
          symbol.proportionalType === ProportionalType.DOUBLE
            ? (symbol.valueColumn ?? mapping.valueColumn)
            : undefined
        ];
      }
      // A sign fill is drawn by the size legend's + and − boxes.
      const fillMode = isSignedProportionalSymbol(visualization)
        ? undefined
        : symbol?.fillMode;
      if (symbol?.mode === SymbolMode.CATEGORIES) {
        columns.color = [symbol.categoryColumn ?? mapping.categoryColumn];
      } else if (fillMode === FillMode.CATEGORIES) {
        columns.color = [
          symbol?.fillCategoryColumn ??
            mapping.colorColumn ??
            mapping.categoryColumn
        ];
      } else if (fillMode === FillMode.CLASSES) {
        columns.color = [
          symbol?.fillValueColumn ?? mapping.colorColumn ?? mapping.valueColumn
        ];
      }
      if (CLASSED_OR_CATEGORICAL_STROKE.has(symbol?.strokeMode)) {
        columns.stroke = [getStrokeColumn(symbol)];
      }
      return columns;
    }
    case 'line': {
      const line = visualization.line;
      const columns: Partial<
        Record<LegendComponent, Array<string | undefined>>
      > = {};
      if (line?.colorMode === ColorMode.CATEGORIES) {
        columns.color = [line.categoryColumn ?? mapping.categoryColumn];
      } else if (line?.colorMode === ColorMode.CLASSES) {
        columns.color = [
          line.valueColumn ?? mapping.colorColumn ?? mapping.valueColumn
        ];
      }
      if (
        line?.thicknessMode === ThicknessMode.PROPORTIONAL ||
        line?.thicknessMode === ThicknessMode.CLASSES
      ) {
        columns.size = [line.sizeColumn ?? mapping.sizeColumn];
      }
      return columns;
    }
    case 'text': {
      const text = visualization.text;
      const columns: Partial<
        Record<LegendComponent, Array<string | undefined>>
      > = {};
      if (CLASSED_OR_CATEGORICAL_COLOR.has(text?.colorMode)) {
        columns.color = [
          text?.colorMode === ColorMode.CATEGORIES
            ? text.categoryColumn
            : text?.valueColumn
        ];
      }
      if (
        text?.sizeMode === SizeMode.PROPORTIONAL ||
        text?.sizeMode === SizeMode.CLASSES
      ) {
        columns.size = [text.valueColumn ?? mapping.valueColumn];
      }
      return columns;
    }
  }
}

const LEGEND_COMPONENT_ORDER: LegendComponent[] = ['color', 'stroke', 'size'];

/**
 * The channels of a primitive that encode a variable. Each one may come from
 * its own column, so when there are several each gets a legend of its own.
 */
export function getLegendComponents(
  visualization: VisualizationConfig,
  primitive: LegendSubtitlePrimitive
): LegendComponent[] {
  const columns = getComponentColumns(visualization, primitive);
  return LEGEND_COMPONENT_ORDER.filter((component) => columns[component]);
}

export function getComponentLegendSubtitle(
  visualization: VisualizationConfig,
  primitive: LegendSubtitlePrimitive,
  component: LegendComponent
): string {
  return joinLegendSubtitleParts(
    getComponentColumns(visualization, primitive)[component] ?? []
  );
}
