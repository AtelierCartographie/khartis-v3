export {
  createCategoricalColorAccessor,
  createChoroplethColorAccessor,
  createGeoJsonCategoricalColorAccessor,
  createGeoJsonChoroplethColorAccessor,
  createGeoJsonProportionalSizeAccessor,
  createProportionalSizeAccessor,
  HIGHLIGHT_FILL_COLOR,
  withOpacity
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
  createEquateurLayer,
  createFrontieresLayer,
  createMeridiensLayer,
  createMersLayer
} from './basemap-layers';
