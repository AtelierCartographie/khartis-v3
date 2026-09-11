export type RgbColor = readonly [number, number, number];
export type RgbaColor = readonly [number, number, number, number];

export const NEUTRAL_CARTOGRAPHY_COLORS = {
  dataFill: '#8d8d8d',
  dataStroke: '#595959',
  missingData: '#b0b0b0',
  land: '#ced6d9',
  nutsLand: '#bdc8cc',
  sea: '#f2f8fa',
  waterLine: '#9f9f9f',
  relief: '#dcdcdc',
  boundaryFine: '#ffffff',
  boundaryMedium: '#ffffff',
  boundaryBold: '#ffffff',
  boundaryCountry: '#ffffff',
  boundaryContext: '#ffffff',
  graticule: '#ced6d9',
  geographicLine: '#777777',
  city: '#4f4f4f',
  cityLabel: '#161616',
  sphereOutline: '#738f99',
  shadow: '#505050',
  black: '#000000',
  white: '#ffffff'
} as const;

export const NEUTRAL_CARTOGRAPHY_RGB_COLORS = {
  shadow: [80, 80, 80],
  cityStroke: [0, 0, 0]
} as const satisfies Record<string, RgbColor>;

export const NEUTRAL_CARTOGRAPHY_RGBA_COLORS = {
  land: [206, 214, 217, 255],
  nutsLand: [189, 200, 204, 255],
  boundaryFine: [255, 255, 255, 255],
  boundaryMedium: [255, 255, 255, 255],
  boundaryBold: [255, 255, 255, 255],
  boundaryCountry: [255, 255, 255, 255],
  boundaryContext: [255, 255, 255, 150],
  graticule: [206, 214, 217, 255],
  geographicLine: [119, 119, 119, 170],
  sphereFill: [255, 255, 255, 255],
  sphereOutline: [115, 143, 153, 255],
  svgDefaultFill: [141, 141, 141, 255],
  svgDefaultStroke: [89, 89, 89, 255],
  transparent: [0, 0, 0, 0]
} as const satisfies Record<string, RgbaColor>;

export const DEFAULT_VISUALIZATION_COLOR = '#0086cc';
export const DEFAULT_VISUALIZATION_SECONDARY_COLOR = '#ff832b';
export const DEFAULT_VISUALIZATION_NEUTRAL_COLOR =
  NEUTRAL_CARTOGRAPHY_COLORS.dataFill;

export const DEFAULT_STROKE_COLOR = '#ffffff';

export const DEFAULT_STYLE_OPACITY = {
  FILL: 0.7,
  FILL_HIGH: 0.8,
  FILL_LOW: 0.6,
  STROKE: 1
} as const;

export const DEFAULT_STROKE_WIDTH = {
  THIN: 1,
  MEDIUM: 2
} as const;
