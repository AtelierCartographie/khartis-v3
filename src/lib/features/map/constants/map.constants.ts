export enum GeometryType {
  POINT = 'POINT',
  MULTIPOINT = 'MULTIPOINT',
  LINESTRING = 'LINESTRING',
  MULTILINESTRING = 'MULTILINESTRING',
  POLYGON = 'POLYGON',
  MULTIPOLYGON = 'MULTIPOLYGON'
}

export enum ArrowExtension {
  GEOARROW_POINT = 'geoarrow.point',
  GEOARROW_MULTIPOINT = 'geoarrow.multipoint',
  GEOARROW_LINESTRING = 'geoarrow.linestring',
  GEOARROW_MULTILINESTRING = 'geoarrow.multilinestring',
  GEOARROW_POLYGON = 'geoarrow.polygon',
  GEOARROW_MULTIPOLYGON = 'geoarrow.multipolygon',
  OGC_WKB = 'ogc.wkb',
  GEOJSON = 'geojson'
}

export enum GeometryEncoding {
  WKB = 'WKB',
  GEOJSON = 'geojson'
}

export enum WKBGeometryTypeCode {
  POINT = 1,
  LINESTRING = 2,
  POLYGON = 3,
  MULTIPOINT = 4,
  MULTILINESTRING = 5,
  MULTIPOLYGON = 6
}

export enum GeoArrowMetadataKey {
  EXTENSION_NAME = 'ARROW:extension:name',
  GEO = 'geo'
}

export enum DeckLayerId {
  POINT_LAYER = 'point-layer',
  LINE_LAYER = 'line-layer',
  POLYGON_LAYER = 'polygon-layer',
  GEOJSON_LAYER = 'geojson-layer',
  WORLD_BASE_LAYER = 'world-base-layer',
  BASEMAP_TERRE = 'basemap-terre',
  BASEMAP_MERS = 'basemap-mers',
  BASEMAP_LACS = 'basemap-lacs',
  BASEMAP_RIVIERES = 'basemap-rivieres',
  BASEMAP_RELIEF = 'basemap-relief',
  BASEMAP_EQUATEUR = 'basemap-equateur',
  BASEMAP_MERIDIENS = 'basemap-meridiens',
  BASEMAP_FRONTIERES = 'basemap-frontieres',
  BASEMAP_VILLES = 'basemap-villes'
}

export enum MapStorageKey {
  MAP_CENTER = 'khartis_map_center',
  MAP_ZOOM = 'khartis_maplibre_zoom'
}

export enum OSMTileServer {
  STANDARD = 'osm-standard',
  CARTO = 'osm-carto',
  HUMANITARIAN = 'osm-humanitarian',
  TRANSPORT = 'osm-transport'
}

export enum OSMSourceId {
  RASTER = 'osm-raster-source'
}

export const DEFAULT_OSM_STYLE = 'standard';

export enum MapLibreLayerType {
  RASTER = 'raster',
  BACKGROUND = 'background'
}

export enum ViewMode {
  ORTHOGRAPHIC = 'orthographic',
  MAPLIBRE = 'maplibre'
}

export const DECK_VIEW_ID = 'main';
export const DECK_CANVAS_ID = 'deckgl-overlay';
export const DECK_DEVICE_TYPE = 'webgl';
export const BASEMAP_DATASET_ID = 'basemap';
export const DEFAULT_PROJECTION_SUFFIX = 'default';

export const GEO_TYPE_TO_EXTENSION: Record<GeometryType, ArrowExtension> = {
  [GeometryType.POINT]: ArrowExtension.GEOARROW_POINT,
  [GeometryType.MULTIPOINT]: ArrowExtension.GEOARROW_MULTIPOINT,
  [GeometryType.LINESTRING]: ArrowExtension.GEOARROW_LINESTRING,
  [GeometryType.MULTILINESTRING]: ArrowExtension.GEOARROW_MULTILINESTRING,
  [GeometryType.POLYGON]: ArrowExtension.GEOARROW_POLYGON,
  [GeometryType.MULTIPOLYGON]: ArrowExtension.GEOARROW_MULTIPOLYGON
};

export const GEO_EXTENSION_TO_TYPE: Record<string, GeometryType> = {
  [ArrowExtension.GEOARROW_POINT]: GeometryType.POINT,
  [ArrowExtension.GEOARROW_MULTIPOINT]: GeometryType.MULTIPOINT,
  [ArrowExtension.GEOARROW_LINESTRING]: GeometryType.LINESTRING,
  [ArrowExtension.GEOARROW_MULTILINESTRING]: GeometryType.MULTILINESTRING,
  [ArrowExtension.GEOARROW_POLYGON]: GeometryType.POLYGON,
  [ArrowExtension.GEOARROW_MULTIPOLYGON]: GeometryType.MULTIPOLYGON
};

export const COMPATIBLE_GEOMETRY_TYPES: Record<GeometryType, GeometryType[]> = {
  [GeometryType.POINT]: [GeometryType.MULTIPOINT],
  [GeometryType.MULTIPOINT]: [GeometryType.POINT],
  [GeometryType.LINESTRING]: [GeometryType.MULTILINESTRING],
  [GeometryType.MULTILINESTRING]: [GeometryType.LINESTRING],
  [GeometryType.POLYGON]: [GeometryType.MULTIPOLYGON],
  [GeometryType.MULTIPOLYGON]: [GeometryType.POLYGON]
};

export function createLayerId(
  prefix: DeckLayerId,
  datasetId?: string,
  projectionSuffix?: string
): string {
  const base = `${prefix}-${datasetId ?? 'default'}`;
  return projectionSuffix ? `${base}-${projectionSuffix}` : base;
}
