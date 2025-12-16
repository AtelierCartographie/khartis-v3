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

export enum SymbolShape {
  CIRCLE = 'circle',
  SQUARE = 'square',
  TRIANGLE = 'triangle',
  DIAMOND = 'diamond'
}

export enum SymbolScale {
  LINEAR = 'linear',
  SQRT = 'sqrt',
  LOG = 'log'
}

export enum FileStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  EDIT = 'edit',
  ERROR = 'error'
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

export const CLASSIFICATION_METHODS = {
  EQUAL_INTERVAL: 'equal_interval',
  QUANTILES: 'quantiles',
  JENKS: 'jenks',
  STANDARD_DEVIATION: 'standard_deviation',
  MANUAL: 'manual'
} as const;

export type ClassificationMethodType =
  (typeof CLASSIFICATION_METHODS)[keyof typeof CLASSIFICATION_METHODS];

export const GPS_COLUMN_PATTERNS = {
  LATITUDE: [
    'lat',
    'latitude',
    'y_coord',
    'y',
    'lat_dd',
    'latitude_dd',
    'geo_lat'
  ],
  LONGITUDE: [
    'lon',
    'long',
    'longitude',
    'x_coord',
    'x',
    'lon_dd',
    'longitude_dd',
    'lng',
    'geo_lon'
  ]
} as const;

export const MIME_TYPES = {
  CSV: 'text/csv',
  PLAIN: 'text/plain',
  JSON: 'application/json',
  GEOJSON: 'application/geo+json',
  ZIP: 'application/zip',
  OCTET_STREAM: 'application/octet-stream'
} as const;

export const SUPPORTED_EXTENSIONS = {
  CSV: '.csv',
  TSV: '.tsv',
  TXT: '.txt',
  JSON: '.json',
  GEOJSON: '.geojson',
  SHP: '.shp',
  GPKG: '.gpkg',
  KML: '.kml',
  KMZ: '.kmz',
  GPX: '.gpx',
  PARQUET: '.parquet',
  GEOPARQUET: '.geoparquet',
  ZIP: '.zip'
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

export enum StrokeStyle {
  LINE = 'line',
  DASHED = 'dashed',
  DOTTED = 'dotted'
}

export enum SimplifiedGeometryType {
  POINT = 'point',
  LINE = 'line',
  POLYGON = 'polygon'
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

export enum ArrowGeometryEncoding {
  GEOJSON = 'geojson',
  OGC_WKB = 'ogc.wkb'
}

export enum VisualizationType {
  CHOROPLETH = 'choropleth',
  PROPORTIONAL = 'proportional',
  CATEGORICAL = 'categorical',
  BIVARIATE = 'bivariate',
  COMBINED = 'combined',
  SIMPLE = 'simple',
  FLOW = 'flow'
}

export enum DataTabStep {
  CONTROL = 'control',
  GEOLOCATE = 'geolocate',
  JOIN = 'join',
  ENRICH = 'enrich'
}

export enum WorkflowMode {
  TABULAR = 'tabular',
  GEOGRAPHIC = 'geographic',
  AUTO = 'auto'
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
  BOTTOM_RIGHT = 'bottom-right'
}

export enum LegendTab {
  CONTENT = 'content',
  STYLE = 'style'
}

export enum ViewMode {
  LIST = 'list',
  GRID = 'grid'
}

export enum AnnotationStylePreset {
  DEFAULT = 'default',
  NOTE = 'note',
  TITLE = 'title',
  SUBTITLE = 'subtitle',
  CAPTION = 'caption'
}

export enum SemioType {
  GEOID = 'geoid',
  GEOLAT = 'geolat',
  GEOLON = 'geolon',
  QTA = 'QTA',
  QTR = 'QTR',
  QL = 'QL',
  QLO = 'QLO'
}

export enum SimplificationTarget {
  BASEMAP = 'basemap',
  GEODATA = 'geodata'
}
