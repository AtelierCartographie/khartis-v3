import { PRINT_STANDARD_TOKENS } from '$lib/features/commons/utils/layout-sizing.utils';
import {
  DEFAULT_VISUALIZATION_COLOR,
  DEFAULT_VISUALIZATION_NEUTRAL_COLOR,
  DEFAULT_VISUALIZATION_SECONDARY_COLOR
} from '$lib/features/commons/constants/colors.constants';

export enum SearchSource {
  ALL = 'all'
}

export enum VizSubTab {
  CHOOSE = 'choose',
  CONFIGURE = 'configure',
  CUSTOMIZE = 'customize'
}

export enum SymbolMode {
  UNIQUE = 'unique',
  PROPORTIONAL = 'proportional',
  CLASSES = 'classes',
  CATEGORIES = 'categories'
}

export type DensityLevelName = 'more' | 'standard' | 'less';

export const DENSITY_LEVEL = {
  MORE: 'more',
  STANDARD: 'standard',
  LESS: 'less'
} as const satisfies Record<string, DensityLevelName>;

export interface DensityLevelOption {
  level: DensityLevelName;
  ratio: number;
}

export interface DensityConfig {
  valueColumn?: string;
  level?: DensityLevelName;
  ratio?: number;
  dotSize?: number;
  color?: string;
  seed?: number;
}

export const DENSITY_DEFAULTS = {
  level: DENSITY_LEVEL.STANDARD,
  dotSize: 1,
  color: DEFAULT_VISUALIZATION_COLOR
} as const;

export enum ProportionalType {
  SINGLE = 'uniques',
  DOUBLE = 'doubles'
}

export enum FillMode {
  NONE = 'none',
  UNIQUE = 'unique',
  DENSITY = 'density',
  CLASSES = 'classes',
  CATEGORIES = 'categories'
}

export enum StrokeMode {
  NONE = 'none',
  UNIQUE = 'unique',
  CLASSES = 'classes',
  CATEGORIES = 'categories'
}

export enum ShapeType {
  CIRCLE = 'circle',
  SQUARE = 'square',
  BAR = 'bar',
  SPIKE = 'spike',
  CROSS = 'cross',
  DIAMOND = 'diamond',
  TRIANGLE = 'triangle',
  STAR = 'star',
  RECTANGLE = 'rectangle'
}

export enum CategoryShapeMode {
  UNIQUE = 'unique',
  DIFFERENT = 'different',
  ORDERED = 'ordered'
}

export enum SymbolDoublePosition {
  OVERLAY = 'overlay',
  JUXTAPOSITION = 'juxtaposition',
  DIVISION = 'division'
}

export const CATEGORY_SHAPE_CYCLE: readonly ShapeType[] = [
  ShapeType.CIRCLE,
  ShapeType.SQUARE,
  ShapeType.TRIANGLE,
  ShapeType.DIAMOND,
  ShapeType.CROSS,
  ShapeType.STAR,
  ShapeType.RECTANGLE
];

/**
 * Numeric ordinal used by the GLSL shader `instanceShapes` attribute.
 * Kept aligned with the MultiShapeLayer SDF dispatcher.
 */
export const SHAPE_ORDINAL: Record<ShapeType, number> = {
  [ShapeType.CIRCLE]: 0,
  [ShapeType.SQUARE]: 1,
  [ShapeType.BAR]: 2,
  [ShapeType.SPIKE]: 3,
  [ShapeType.CROSS]: 4,
  [ShapeType.DIAMOND]: 5,
  [ShapeType.TRIANGLE]: 6,
  [ShapeType.STAR]: 7,
  [ShapeType.RECTANGLE]: 8
};

/**
 * Shapes that scale on height only (1D), not area (2D).
 */
export const LINEAR_SHAPES: readonly ShapeType[] = [
  ShapeType.BAR,
  ShapeType.SPIKE
];
export const DEFAULT_LINEAR_SYMBOL_BAR_WIDTH = 6;

export function isLinearShape(shape: ShapeType): boolean {
  return LINEAR_SHAPES.includes(shape);
}

/**
 * Availability matrix per symbol mode — see issue #92.
 */
export function availableShapesForSymbolMode(mode: SymbolMode): ShapeType[] {
  switch (mode) {
    case SymbolMode.UNIQUE:
    case SymbolMode.CATEGORIES:
      return [
        ShapeType.CIRCLE,
        ShapeType.SQUARE,
        ShapeType.CROSS,
        ShapeType.DIAMOND,
        ShapeType.TRIANGLE,
        ShapeType.STAR,
        ShapeType.RECTANGLE
      ];
    case SymbolMode.PROPORTIONAL:
    case SymbolMode.CLASSES:
      return [
        ShapeType.CIRCLE,
        ShapeType.SQUARE,
        ShapeType.BAR,
        ShapeType.SPIKE
      ];
    default:
      return [ShapeType.CIRCLE];
  }
}

export enum MissingDataShape {
  CIRCLE = 'circle',
  CROSS = 'cross',
  SQUARE = 'square'
}

export enum ThicknessMode {
  NONE = 'none',
  UNIQUE = 'unique',
  PROPORTIONAL = 'proportional',
  CLASSES = 'classes'
}

export enum ColorMode {
  NONE = 'none',
  UNIQUE = 'unique',
  CLASSES = 'classes',
  CATEGORIES = 'categories'
}

export enum SizeMode {
  FIXED = 'fixed',
  PROPORTIONAL = 'proportional'
}

export const VISUALIZATION_DEFAULTS = {
  symbolMaxSize: 24,
  symbolSize: 12,
  symbolOpacity: 100,
  symbolCategoriesStrokeOpacity: 0.6,
  strokeWidth: 1,
  strokeOpacity: 100,
  fillOpacity: 100,
  textSize: PRINT_STANDARD_TOKENS.annotations.noteFontSize,
  textOpacity: 100,
  labelSize: PRINT_STANDARD_TOKENS.legend.fontSize,
  labelOpacity: 100,
  lineWidth: 1,
  lineMaxWidth: 5,
  lineOpacity: 100,
  haloWidth: 2
} satisfies Record<string, number>;

export const SLIDER_LIMITS = {
  opacity: { min: 0, max: 100, step: 1 },
  strokeWidth: { min: 0, max: 5, step: 0.5 },
  lineWidth: { min: 0.5, max: 5, step: 0.5 },
  lineMaxWidth: { min: 1, max: 8, step: 0.5 },
  lineOpacity: { min: 0, max: 100, step: 1 },
  symbolSize: { min: 1, max: 30, step: 1 },
  symbolMaxSize: { min: 2, max: 40, step: 1 },
  symbolBarWidth: { min: 1, max: 30, step: 1 },
  textSize: { min: 6, max: 24, step: 1 },
  textOpacity: { min: 0, max: 100, step: 1 },
  labelOpacity: { min: 0, max: 100, step: 1 },
  haloWidth: { min: 0, max: 6, step: 0.5 },
  missingDataSize: { min: 1, max: 12, step: 0.5 }
} as const;

export const MIN_VISIBLE_STROKE_WIDTH = 1;

export const DOT_DENSITY = {
  size: { min: 0.5, max: 4, step: 0.25 }
} as const;

export const SLIDER_DEBOUNCE_MS = {
  STYLE: 120,
  HEAVY: 250,
  CLASSIFICATION: 300
} as const;

export const DEFAULT_COLORS = {
  fill: DEFAULT_VISUALIZATION_COLOR,
  secondary: DEFAULT_VISUALIZATION_SECONDARY_COLOR,
  stroke: '#1e3a5f',
  line: '#1e3a5f',
  text: '#000000',
  halo: '#ffffff',
  missingData: '#c6c6c6',
  white: '#ffffff',
  black: '#000000',
  gray: DEFAULT_VISUALIZATION_NEUTRAL_COLOR
} as const;

export enum BasemapRemarquables {
  ALL = 'all',
  EQUATOR_TROPICS = 'equator-tropics',
  MAJOR = 'major',
  MINOR = 'minor'
}

export enum BasemapGraticuleMode {
  REMARKABLE = 'remarkable',
  REGULAR = 'regular'
}

export enum BasemapRepresentation {
  SHADING = 'shading',
  ELEVATION = 'elevation',
  CONTOURS = 'contours'
}

export enum BasemapCityCategory {
  CAPITALS = 'capitals',
  POP_100K = '100k',
  POP_250K = '250k',
  POP_500K = '500k'
}

export enum BasemapCitySymbol {
  POINT = 'point',
  SQUARE = 'square',
  DIAMOND = 'diamond',
  STAR = 'star'
}

export enum BasemapDottedPattern {
  DOTS = 'dots',
  DASHES = 'dashes',
  DASH_DOT = 'dash-dot',
  LONG_DASH = 'long-dash'
}

export enum BasemapColorId {
  GRAY_LIGHT = 'gray-light',
  GRAY = 'gray',
  GRAY_DARK = 'gray-dark',
  BLUE_LIGHT = 'blue-light',
  BLUE = 'blue',
  BEIGE = 'beige',
  WHITE = 'white',
  BLACK = 'black'
}

export const BASEMAP_LAYER_CONFIG = {
  opacity: { min: 0, max: 100, step: 1 },
  thickness: { min: 0.25, max: 3, step: 0.25 },
  graticuleSpacing: { min: 1, max: 90, step: 1 },
  size: { min: 1, max: 16, step: 1 },
  cityCount: { min: 1, max: 100, step: 1 }
} as const;

export const UI_CONSTANTS = {
  SUGGESTIONS_PER_PAGE: 3,
  MAX_SUGGESTIONS: 12,
  SEARCH_DEBOUNCE_MS: 300,
  MIN_SEARCH_LENGTH: 3,
  MAP_HIGHLIGHT_DEBOUNCE_MS: 800,
  DATA_TABLE_SKELETON_COLUMNS: 5,
  DATA_TABLE_SKELETON_ROWS: 5,
  TRUNCATE_FILE_NAME_MAX_LENGTH: 20
} as const;
