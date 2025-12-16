export {
  BASE_FILL_COLOR,
  BASE_STROKE_COLOR,
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
  createWorldBaseLayer,
  type LayerContext
} from './layer-factory';
