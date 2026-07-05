export type RgbColor = readonly [number, number, number];
export type RgbaColor = readonly [number, number, number, number];

export const NEUTRAL_CARTOGRAPHY_COLORS = {
  dataFill: '#8d8d8d',
  dataStroke: '#595959',
  missingData: '#b0b0b0',
  land: '#d6d6d6',
  nutsLand: '#c6c6c6',
  sea: '#f2f2f2',
  waterLine: '#9f9f9f',
  relief: '#dcdcdc',
  boundaryFine: '#8f8f8f',
  boundaryMedium: '#676767',
  boundaryBold: '#3f3f3f',
  boundaryCountry: '#2f2f2f',
  boundaryContext: '#aaaaaa',
  graticule: '#b5b5b5',
  geographicLine: '#777777',
  city: '#4f4f4f',
  cityLabel: '#161616',
  sphereOutline: '#565656',
  shadow: '#505050',
  black: '#000000',
  white: '#ffffff'
} as const;

export const NEUTRAL_CARTOGRAPHY_RGB_COLORS = {
  shadow: [80, 80, 80],
  cityStroke: [0, 0, 0]
} as const satisfies Record<string, RgbColor>;

export const NEUTRAL_CARTOGRAPHY_RGBA_COLORS = {
  land: [214, 214, 214, 255],
  nutsLand: [198, 198, 198, 255],
  boundaryFine: [143, 143, 143, 200],
  boundaryMedium: [103, 103, 103, 220],
  boundaryBold: [63, 63, 63, 255],
  boundaryCountry: [47, 47, 47, 255],
  boundaryContext: [170, 170, 170, 150],
  graticule: [181, 181, 181, 100],
  geographicLine: [119, 119, 119, 170],
  sphereFill: [255, 255, 255, 255],
  sphereOutline: [86, 86, 86, 200],
  svgDefaultFill: [141, 141, 141, 255],
  svgDefaultStroke: [89, 89, 89, 255],
  transparent: [0, 0, 0, 0]
} as const satisfies Record<string, RgbaColor>;

export const DEFAULT_VISUALIZATION_COLOR = '#4589ff';
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
