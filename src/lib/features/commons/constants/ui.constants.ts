export enum PageModel {
  A4_LANDSCAPE = 'page-a4-landscape',
  A4_PORTRAIT = 'page-a4-portrait',
  A3_LANDSCAPE = 'page-a3-landscape',
  A3_PORTRAIT = 'page-a3-portrait'
}

export enum Orientation {
  PORTRAIT = 'portrait',
  LANDSCAPE = 'landscape'
}

export enum FormatMode {
  PRESET = 'preset',
  CUSTOM = 'custom'
}

export enum FileStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  EDIT = 'edit',
  ERROR = 'error',
  INCOMPLETE = 'incomplete'
}

export enum ExampleCategory {
  ALL = 'all',
  SYMBOLS = 'symbols',
  POLYGONS = 'polygons',
  LINES = 'lines',
  TEXTS = 'texts',
  HYBRIDS = 'hybrids'
}

export const PAGE_PRESETS = {
  [PageModel.A4_LANDSCAPE]: { width: 842, height: 595 },
  [PageModel.A4_PORTRAIT]: { width: 595, height: 842 },
  [PageModel.A3_LANDSCAPE]: { width: 1191, height: 842 },
  [PageModel.A3_PORTRAIT]: { width: 842, height: 1191 }
} as const;

export const DEFAULT_MARGINS = {
  top: 32,
  bottom: 32,
  left: 32,
  right: 32
} as const;

export const SHAPEFILE_EXTENSIONS = [
  '.shp',
  '.shx',
  '.dbf',
  '.prj',
  '.cpg',
  '.sbn',
  '.sbx'
] as const;

export const IGNORED_FILE_PREFIXES = ['__MACOSX', '.DS_Store', '._'] as const;

export enum ScaleForm {
  LINE = 'line',
  BOX = 'box'
}

export enum AnnotationKind {
  TEXT = 'text',
  SHAPE = 'shape',
  DRAWING = 'drawing',
  IMAGE = 'image'
}

export enum DrawingType {
  LINE = 'line',
  ZONE = 'zone'
}

export enum BasemapLayerType {
  CENTROID = 'centroid',
  LIMIT = 'limit',
  POLYGON = 'polygon',
  LINE = 'line',
  POINT = 'point'
}

export enum JoinStatus {
  JOINED = 'joined',
  TO_VERIFY = 'to_verify',
  DUPLICATE = 'duplicate',
  UNRECOGNIZED = 'unrecognized'
}

export enum OrientationIndicatorStyle {
  ARROW = 'arrow',
  COMPASS = 'compass'
}

export enum InsetMapType {
  GLOBE = 'globe',
  PLANISPHERE = 'planisphere'
}

export enum DistanceUnit {
  KILOMETERS = 'kilometers',
  MILES = 'miles'
}

export enum GeoreferenceType {
  ENTITIES = 'entities',
  COORDINATES = 'coordinates',
  CUSTOM = 'custom'
}

export enum BasemapSource {
  CATALOG = 'catalog',
  IMPORT = 'import',
  OSM = 'osm'
}

export enum TableViewType {
  COMPACT = 'compact',
  EXPANDED = 'expanded'
}

export enum ColorBlindnessType {
  NONE = 'none',
  PROTANOPIA = 'protanopia',
  DEUTERANOPIA = 'deuteranopia',
  TRITANOPIA = 'tritanopia',
  PROTANOMALY = 'protanomaly',
  DEUTERANOMALY = 'deuteranomaly',
  TRITANOMALY = 'tritanomaly',
  ACHROMATOPSIA = 'achromatopsia',
  ACHROMATOMALY = 'achromatomaly'
}

export enum LegendPosition {
  TOP_LEFT = 'top-left',
  TOP_RIGHT = 'top-right',
  BOTTOM_LEFT = 'bottom-left',
  BOTTOM_RIGHT = 'bottom-right',
  BOTTOM_CENTER = 'bottom-center'
}

export enum LegendTab {
  CONTENT = 'content',
  STYLE = 'style'
}

export enum ViewMode {
  LIST = 'list',
  GRID = 'grid'
}

export enum SimplificationTarget {
  BASEMAP = 'basemap',
  GEODATA = 'geodata'
}

/**
 * Z-index layering system - maps to CSS custom properties in global.css
 * Use these via CSS: `z-index: var(--z-toolbar);`
 */
export const Z_INDEX = {
  BASE: 1,
  MAP_LAYER: 5,
  CONTENT: 10,
  CONTENT_RAISED: 15,
  CONTENT_HEADER: 20,
  MAP_OVERLAY: 50,
  DROPDOWN: 100,
  MOBILE_OPEN_BUTTON: 800,
  MOBILE_OVERLAY: 850,
  MOBILE_TOOLBAR: 900,
  TOOLBAR: 1000,
  MAIN_TOOLBAR: 1100,
  OVERLAY: 9999,
  NOTIFICATION: 10000,
  POPOVER: 10001
} as const;
