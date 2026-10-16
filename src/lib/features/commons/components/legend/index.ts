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
  draw_khartis_proportional_line_legend,
  draw_khartis_swatch_legend,
  type KhartisLegendSwatchItem,
  type KhartisLegendSwatchType,
  type LegendPatternFill,
  type KhartisLineWidthLegendStep,
  type KhartisProportionalLineLegendStep
} from './khartis-extensions';
export {
  draw_quanti_color_legend,
  type QuantiColorSwatch
} from './quantitative';
export { draw_symbols_legend, type SymbolType } from './symbols';
export {
  categoryLegendEntry,
  classLegendEntry,
  createLegendSvg,
  LEGEND_ENTRY_ATTRIBUTE,
  MAX_LEGEND_CATEGORIES,
  MISSING_LEGEND_ENTRY,
  type CommonLegendTextOptions,
  type LegendSvgDefinition
} from './utils';
