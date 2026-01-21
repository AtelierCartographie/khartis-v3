// =============================================================================
// Types
// =============================================================================
export type {
  BasemapCatalog,
  BasemapLayer,
  BasemapMetadata,
  BasemapSuggestion,
  BBox,
  CanvasSize,
  DeckDataRow,
  DeckMapProps,
  DeckTooltipInfo,
  GeometryInfo,
  JoinEntity,
  JoinQuality,
  LayerContext,
  MapPosition,
  RGBColor,
  TooltipEntry,
  TooltipResult,
  TooltipStyle
} from './types';

export type {
  BasemapLayerConfig,
  BasemapLayerId,
  EquateurLayerConfig,
  FrontieresLayerConfig,
  LacsLayerConfig,
  MeridiensLayerConfig,
  MersLayerConfig,
  ReliefLayerConfig,
  RivieresLayerConfig,
  TerreLayerConfig,
  VillesLayerConfig
} from './stores/basemap-layers.store.svelte';

export type { MapProjectionType } from './stores/map-projection.store.svelte';

// =============================================================================
// Constants
// =============================================================================
export {
  ArrowExtension,
  COMPATIBLE_GEOMETRY_TYPES,
  createLayerId,
  DeckLayerId,
  DEFAULT_OSM_STYLE,
  GEO_EXTENSION_TO_TYPE,
  GEO_TYPE_TO_EXTENSION,
  GeoArrowMetadataKey,
  GeoColumnName,
  GEOJSON_GEOMETRY_TYPES,
  GeoJsonFeatureType,
  GeoJsonGeometryType,
  GeometryEncoding,
  GeometryType,
  MapLibreLayerType,
  MapStorageKey,
  OSMSourceId,
  OSMTileServer,
  ReservedColumnName,
  WKBGeometryTypeCode
} from './constants';

export {
  BasemapStyle,
  BASEMAP_STYLES,
  DEFAULT_BASEMAP_STYLE,
  getBasemapStyle
} from './constants/basemap-styles';

// =============================================================================
// Core Functions
// =============================================================================
export {
  calculateBoundsFromGeoArrow,
  calculateBoundsFromGeoJSON,
  get_bbox_center,
  get_bbox_from_geoparquet,
  get_max_scale,
  get_model_matrix,
  is_local_projection
} from './core';

// =============================================================================
// IO Functions (Geometry Parsing)
// =============================================================================
export {
  areGeometryTypesCompatible,
  arrowTableToGeoJSON,
  extractGeometryInfo,
  isGeoJsonGeometry,
  parseGeoArrowNative,
  parseGeoJsonGeometry,
  parseWkbToGeoJson
} from './io';

// =============================================================================
// Layer Functions
// =============================================================================
export {
  BASE_FILL_COLOR,
  BASE_STROKE_COLOR,
  createBasemapLayers,
  createCategoricalColorAccessor,
  createChoroplethColorAccessor,
  createDeckLayers,
  createEquateurLayer,
  createFrontieresLayer,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonChoroplethColorAccessor,
  createGeoJsonLayers,
  createGeoJsonProportionalSizeAccessor,
  createLineLayers,
  createMeridiensLayer,
  createMersLayer,
  createPointLayers,
  createPolygonLayers,
  createProportionalSizeAccessor,
  createTerreLayer,
  createWorldBaseLayer,
  getBasemapLayerOrder,
  HIGHLIGHT_FILL_COLOR,
  withOpacity
} from './layers';

// =============================================================================
// Styling Functions
// =============================================================================
export {
  getCategoricalColorMap,
  getColorForValue,
  getSizeForValue,
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols
} from './styling';

// =============================================================================
// Interactions
// =============================================================================
export {
  createTooltipHandler,
  formatTooltipValue,
  getTooltip
} from './interactions';

// =============================================================================
// Hooks
// =============================================================================
export {
  useMapBasemap,
  useMapBounds,
  useMapInit,
  useMapLayers,
  useMapPosition,
  useMapState
} from './hooks';

export type {
  MapInitConfig,
  UseMapBasemapProps,
  UseMapBasemapReturn,
  UseMapBoundsProps,
  UseMapBoundsReturn,
  UseMapInitProps,
  UseMapInitReturn,
  UseMapLayersProps,
  UseMapLayersReturn,
  UseMapPositionProps,
  UseMapPositionReturn,
  UseMapStateReturn,
  ViewMode
} from './hooks';

// =============================================================================
// Services
// =============================================================================
export {
  basemapCatalogService,
  basemapService,
  createOSMRasterLayer,
  createOSMRasterSource,
  extractOSMStyle,
  getOSMTileConfig,
  isOSMBasemap
} from './services';

export type { OSMTileConfig } from './services/osm-tile.service';

// =============================================================================
// Stores
// =============================================================================
export {
  basemapLayersStore,
  BasemapDottedPattern
} from './stores/basemap-layers.store.svelte';
export { mapProjectionStore } from './stores/map-projection.store.svelte';
export { osmBasemapStore } from './stores/osm-basemap.store.svelte';
export { projectionStore } from './stores/projection.store.svelte';

// =============================================================================
// Components
// =============================================================================
export { default as MainMap } from './main-map.svelte';
export { default as ThematicMap } from './components/thematic-map.svelte';
export { default as ZoomToolbar } from './components/zoom-toolbar.svelte';
export { default as GeoIndicationsOverlay } from './components/geo-indications-overlay.svelte';
export { default as MobileOpenPanelButton } from './components/mobile-open-panel-button.svelte';
