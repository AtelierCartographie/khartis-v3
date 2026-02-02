export enum SearchSource {
  ALL = 'all'
}

export enum VizSubTab {
  CHOOSE = 'choose',
  CONFIGURE = 'configure'
}

export enum SymbolMode {
  UNIQUE = 'unique',
  PROPORTIONAL = 'proportional',
  CLASSES = 'classes',
  CATEGORIES = 'categories'
}

export enum ProportionalType {
  SINGLE = 'uniques',
  DOUBLE = 'doubles'
}

export enum FillMode {
  NONE = 'none',
  UNIQUE = 'unique',
  CLASSES = 'classes',
  CATEGORIES = 'categories'
}

export enum FillType {
  UNIQUE = 'unique',
  CLASSES = 'classes'
}

export enum StrokeMode {
  NONE = 'none',
  UNIQUE = 'unique',
  CLASSES = 'classes',
  CATEGORIES = 'categories'
}

export enum LabelStrokeType {
  NONE = 'aucun',
  UNIQUE = 'unique'
}

export enum ShapeType {
  POINT = 'point',
  SQUARE = 'square',
  TRIANGLE = 'triangle'
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
  GRADUATED = 'graduated',
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
  symbolOpacity: 80,
  strokeWidth: 1,
  strokeOpacity: 100,
  fillOpacity: 100,
  textSize: 12,
  textOpacity: 100,
  labelSize: 12,
  labelOpacity: 100,
  lineWidth: 1,
  lineMaxWidth: 10,
  lineOpacity: 100,
  haloWidth: 2
} as const;

export const SLIDER_LIMITS = {
  opacity: { min: 0, max: 100 },
  strokeWidth: { min: 0, max: 20 },
  lineWidth: { min: 1, max: 20 },
  lineMaxWidth: { min: 1, max: 50 },
  lineOpacity: { min: 0, max: 100 },
  symbolSize: { min: 1, max: 100 },
  symbolMaxSize: { min: 1, max: 200 },
  textSize: { min: 8, max: 32 },
  textOpacity: { min: 0, max: 100 },
  labelOpacity: { min: 0, max: 100 },
  haloWidth: { min: 0, max: 10 },
  missingDataSize: { min: 1, max: 20 }
} as const;

export const DEFAULT_COLORS = {
  fill: '#4589ff',
  stroke: '#1e3a5f',
  line: '#1e3a5f',
  text: '#161616',
  label: '#161616',
  halo: '#ffffff',
  missingData: '#c6c6c6',
  white: '#ffffff',
  black: '#000000',
  gray: '#8d8d8d'
} as const;

export enum BasemapRemarquables {
  ALL = 'all',
  EQUATOR_TROPICS = 'equator-tropics',
  MAJOR = 'major',
  MINOR = 'minor'
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

export const BASEMAP_COLOR_VALUES: Record<BasemapColorId, string> = {
  [BasemapColorId.GRAY_LIGHT]: '#e0e0e0',
  [BasemapColorId.GRAY]: '#8d8d8d',
  [BasemapColorId.GRAY_DARK]: '#525252',
  [BasemapColorId.BLUE_LIGHT]: '#a6c8ff',
  [BasemapColorId.BLUE]: '#0072c3',
  [BasemapColorId.BEIGE]: '#f5e6d3',
  [BasemapColorId.WHITE]: '#ffffff',
  [BasemapColorId.BLACK]: '#161616'
} as const;

export const BASEMAP_LAYER_CONFIG = {
  opacity: { min: 0, max: 100 },
  thickness: { min: 1, max: 20 },
  size: { min: 1, max: 100 }
} as const;

export enum LabelPosition {
  CENTER = 'center',
  TOP = 'top',
  BOTTOM = 'bottom',
  LEFT = 'left',
  RIGHT = 'right'
}
