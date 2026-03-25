export {
  createCategoricalColorAccessor,
  createChoroplethColorAccessor,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonChoroplethColorAccessor,
  createGeoJsonProportionalSizeAccessor,
  createProportionalSizeAccessor,
  HIGHLIGHT_FILL_COLOR,
  withGeoJsonRowHighlight,
  withGeoJsonRowHighlightAccessor,
  withOpacity,
  withRowHighlight,
  withRowHighlightAccessor
} from './layer-helpers';

export {
  createDeckLayers,
  createGeoJsonLayers,
  createLineLayers,
  createPointLayers,
  createPolygonLayers,
  type LayerContext
} from './layer-factory';

export {
  createBasemapLayers,
  type BasemapLayerGroups,
  createEquateurLayer,
  createFrontieresLayer,
  createMeridiensLayer,
  createMersLayer
} from './basemap-layers';
