export { default as LegendSvg } from './legend-svg.svelte';
export {
  draw_categorical_legend,
  type CategoricalFooterShapeType,
  type CategoricalShapeType,
  type CategoryItem
} from './categorical';
export {
  draw_khartis_density_legend,
  draw_khartis_line_width_legend,
  draw_khartis_swatch_legend,
  type KhartisLegendSwatchItem,
  type KhartisLegendSwatchType,
  type LegendPatternFill,
  type KhartisLineWidthLegendStep
} from './khartis-extensions';
export { draw_quanti_color_legend } from './quantitative';
export { draw_symbols_legend, type SymbolType } from './symbols';
export {
  createLegendSvg,
  MAX_LEGEND_CATEGORIES,
  type CommonLegendTextOptions,
  type LegendSvgDefinition
} from './utils';
