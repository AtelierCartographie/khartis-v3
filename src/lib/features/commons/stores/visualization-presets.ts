import type {
  DatasetResult,
  ProcessedDataset
} from '$lib/features/data-pipeline';
import {
  BasemapDottedPattern,
  DEFAULT_COLORS,
  DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
  DEFAULT_DISCRETIZATION_CLASS_COUNT,
  FillMode,
  MissingDataShape,
  ShapeType,
  StrokeMode,
  SymbolMode,
  VisualizationType,
  VISUALIZATION_DEFAULTS
} from '$lib/features/commons/constants/visualization.constants';
import { DEFAULT_CATEGORICAL_COLORS as FIGMA_DEFAULT_CATEGORICAL_COLORS } from '../constants/qualitative-palette.constants';
import { COLUMN_TYPE_GEOMETRY } from '../constants/data.constants';
import {
  DEFAULT_STROKE_COLOR,
  DEFAULT_VISUALIZATION_COLOR,
  DEFAULT_STYLE_OPACITY,
  DEFAULT_STROKE_WIDTH
} from '../constants/colors.constants';
import {
  findPreferredNumericColumn,
  findPreferredTextColumn
} from '../utils/visualization-columns.utils';
import { CARTOGRAPHIC_FONT_FAMILY } from '$lib/features/step-toolbar/fonts.constants';
import {
  ClassificationMethod,
  ScaleType,
  type ClassificationConfig,
  type MissingDataConfig,
  type PrimitiveFilter,
  type VisualizationConfig,
  type VisualizationModes,
  type VisualizationPreset
} from './visualization.types';
import {
  DEFAULT_SYMBOL_MAX_SIZE,
  DEFAULT_SYMBOL_OPACITY,
  resolveDefaultPrimitiveFilters,
  resolveGeometryFamilyFromDataset,
  withPrimitiveConfigs
} from './visualization-normalize';

type VisualizationSymbols = NonNullable<VisualizationConfig['symbols']>;

const DEFAULT_SYMBOL_SIZE = VISUALIZATION_DEFAULTS.symbolSize;
const DEFAULT_SYMBOL_MIN_SIZE = 5;
const DEFAULT_LABEL_OPACITY = 0;
const DEFAULT_TEXT_OPACITY = 0;

const DEFAULT_MISSING_DATA_COLOR = DEFAULT_COLORS.missingData;

const DEFAULT_CHOROPLETH_COLORS = ['#e0e2e4', '#a1bed9', '#5e9acb', '#0076ba'];

export const DEFAULT_CATEGORICAL_COLORS = [...FIGMA_DEFAULT_CATEGORICAL_COLORS];

function getDefaultStyle(
  type: VisualizationType
): VisualizationConfig['style'] {
  const textOverlayDefaults: VisualizationConfig['style'] = {
    labelColor: DEFAULT_COLORS.text,
    labelOpacity: DEFAULT_LABEL_OPACITY,
    labelFontFamily: CARTOGRAPHIC_FONT_FAMILY,
    labelBold: false,
    labelItalic: false,
    labelCollisionDetection: true,
    textColor: DEFAULT_COLORS.text,
    textOpacity: DEFAULT_TEXT_OPACITY,
    textFontFamily: CARTOGRAPHIC_FONT_FAMILY,
    textCollisionDetection: true
  };

  switch (type) {
    case VisualizationType.CHOROPLETH:
      return {
        ...textOverlayDefaults,
        fillOpacity: DEFAULT_STYLE_OPACITY.FILL_HIGH,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH.THIN,
        strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
      };

    case VisualizationType.PROPORTIONAL:
      return {
        ...textOverlayDefaults,
        symbolFillColor: DEFAULT_VISUALIZATION_COLOR,
        fillOpacity: DEFAULT_STYLE_OPACITY.FILL_LOW,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH.MEDIUM,
        strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
      };

    case VisualizationType.CATEGORICAL:
      return {
        ...textOverlayDefaults,
        fillOpacity: DEFAULT_STYLE_OPACITY.FILL_HIGH,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH.THIN,
        strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
      };

    default:
      return {
        ...textOverlayDefaults,
        fillColor: DEFAULT_VISUALIZATION_COLOR,
        fillOpacity: DEFAULT_STYLE_OPACITY.FILL,
        strokeColor: DEFAULT_STROKE_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH.THIN,
        strokeOpacity: DEFAULT_STYLE_OPACITY.STROKE
      };
  }
}

function getDefaultMapping(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): VisualizationConfig['mapping'] {
  const geometryColumn = dataset.columns.find(
    (column) => column.type === COLUMN_TYPE_GEOMETRY
  );
  const firstNumericColumn = findPreferredNumericColumn(dataset.columns, {
    allowIdLikeFallback: true,
    excludeLikelyCoordinates: true
  });
  const secondNumericColumn = findPreferredNumericColumn(dataset.columns, {
    exclude: [firstNumericColumn],
    allowIdLikeFallback: true,
    excludeLikelyCoordinates: true
  });
  const firstTextColumn = findPreferredTextColumn(dataset.columns);

  const mapping: VisualizationConfig['mapping'] = {
    geometryColumn: geometryColumn?.name
  };

  switch (type) {
    case VisualizationType.CHOROPLETH:
      mapping.valueColumn = firstNumericColumn;
      break;

    case VisualizationType.PROPORTIONAL:
      mapping.sizeColumn = firstNumericColumn;
      break;

    case VisualizationType.CATEGORICAL:
      mapping.categoryColumn = firstTextColumn;
      break;

    case VisualizationType.BIVARIATE:
      mapping.sizeColumn = firstNumericColumn;
      mapping.valueColumn = secondNumericColumn;
      break;
  }

  return mapping;
}

function getDefaultClassification(
  type: VisualizationType
): ClassificationConfig | undefined {
  if (
    type === VisualizationType.CHOROPLETH ||
    type === VisualizationType.BIVARIATE
  ) {
    return {
      method: ClassificationMethod.KMEANS,
      classes: DEFAULT_DISCRETIZATION_CLASS_COUNT,
      colors: [...DEFAULT_CHOROPLETH_COLORS]
    };
  }

  if (type === VisualizationType.CATEGORICAL) {
    return {
      method: ClassificationMethod.MANUAL,
      classes: 0,
      colors: [...DEFAULT_CATEGORICAL_COLORS]
    };
  }

  return undefined;
}

function getDefaultModes(type: VisualizationType): VisualizationModes {
  switch (type) {
    case VisualizationType.PROPORTIONAL:
      return {
        symbol: SymbolMode.PROPORTIONAL,
        fill: FillMode.UNIQUE,
        stroke: StrokeMode.UNIQUE
      };
    case VisualizationType.CATEGORICAL:
      return {
        symbol: SymbolMode.CATEGORIES,
        fill: FillMode.CATEGORIES,
        stroke: StrokeMode.NONE
      };
    case VisualizationType.CHOROPLETH:
      return {
        symbol: SymbolMode.UNIQUE,
        fill: FillMode.CLASSES,
        stroke: StrokeMode.UNIQUE
      };
    case VisualizationType.BIVARIATE:
      return {
        symbol: SymbolMode.PROPORTIONAL,
        fill: FillMode.CLASSES,
        stroke: StrokeMode.NONE
      };
    default:
      return {
        symbol: SymbolMode.UNIQUE,
        fill: FillMode.UNIQUE,
        stroke: StrokeMode.NONE
      };
  }
}

const SPARSE_POLYGON_THRESHOLD = 500;
const SPARSE_SYMBOL_FLOOR_PX = 10;
const DENSE_SYMBOL_FLOOR_PX = 6;
const SYMBOL_DENSITY_COEFFICIENT = 140;

function resolveProportionalSymbolMaxSize(rowCount: number): number {
  const safeRowCount = Math.max(rowCount, 1);
  const floor =
    safeRowCount < SPARSE_POLYGON_THRESHOLD
      ? SPARSE_SYMBOL_FLOOR_PX
      : DENSE_SYMBOL_FLOOR_PX;
  return Math.max(
    floor,
    Math.min(
      VISUALIZATION_DEFAULTS.symbolMaxSize,
      Math.round(SYMBOL_DENSITY_COEFFICIENT / Math.sqrt(safeRowCount))
    )
  );
}

function resolveProportionalSymbolMinSize(maxSize: number): number {
  return Math.max(1, Math.min(4, Math.round(maxSize / 4)));
}

function getDefaultSymbols(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): VisualizationSymbols {
  const isPolygonGeometry =
    resolveGeometryFamilyFromDataset(dataset) === 'polygon';
  const rowCount = 'rowCount' in dataset ? (dataset.rowCount ?? 0) : 0;
  const densityAdjustedMaxSize =
    isPolygonGeometry &&
    (type === VisualizationType.PROPORTIONAL ||
      type === VisualizationType.BIVARIATE)
      ? resolveProportionalSymbolMaxSize(rowCount)
      : DEFAULT_SYMBOL_MAX_SIZE;
  const minSize = isPolygonGeometry
    ? resolveProportionalSymbolMinSize(densityAdjustedMaxSize)
    : DEFAULT_SYMBOL_MIN_SIZE;

  return {
    type: ShapeType.CIRCLE,
    size: DEFAULT_SYMBOL_SIZE,
    minSize,
    maxSize: densityAdjustedMaxSize,
    barWidth: DEFAULT_LINEAR_SYMBOL_BAR_WIDTH,
    sizeScale:
      type === VisualizationType.PROPORTIONAL
        ? ScaleType.SQRT
        : ScaleType.LINEAR,
    opacity: DEFAULT_SYMBOL_OPACITY
  };
}

function getDefaultPrimitiveFilters(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): PrimitiveFilter[] {
  return resolveDefaultPrimitiveFilters(type, dataset);
}

export function buildVisualizationPreset(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): VisualizationPreset {
  const preset: VisualizationPreset = {
    type,
    modes: getDefaultModes(type),
    primitiveFilters: getDefaultPrimitiveFilters(type, dataset),
    style: getDefaultStyle(type),
    mapping: getDefaultMapping(type, dataset),
    classification: getDefaultClassification(type),
    symbols: getDefaultSymbols(type, dataset),
    missingData: getDefaultMissingData()
  };

  const normalizedPreset = withPrimitiveConfigs({
    id: '__preset__',
    name: '__preset__',
    datasetId: dataset.id,
    enabled: true,
    ...preset
  } as VisualizationConfig);

  return {
    ...preset,
    polygon: normalizedPreset.polygon,
    symbol: normalizedPreset.symbol,
    line: normalizedPreset.line,
    text: normalizedPreset.text
  };
}

export function resolveVisualizationPreset(
  type: VisualizationType,
  dataset: ProcessedDataset | DatasetResult
): VisualizationPreset {
  return buildVisualizationPreset(type, dataset);
}

export function getDefaultMissingData(): MissingDataConfig {
  return {
    show: true,
    shape: MissingDataShape.CIRCLE,
    size: 2,
    color: DEFAULT_MISSING_DATA_COLOR,
    pattern: false,
    dashed: false,
    dashedPattern: BasemapDottedPattern.DOTS
  };
}
