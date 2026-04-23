export { default as LegendSvg } from './legend-svg.svelte';
export {
  draw_categorical_legend,
  type CategoricalFooterShapeType,
  type CategoricalLegendOptions,
  type CategoricalShapeType,
  type CategoryItem
} from './categorical';
export {
  draw_khartis_density_legend,
  draw_khartis_double_symbols_legend,
  draw_khartis_line_width_legend,
  draw_khartis_swatch_legend,
  type KhartisDensityLegendOptions,
  type KhartisDoubleSymbolsLegendOptions,
  type KhartisDoubleSymbolsLegendStep,
  type KhartisLegendSwatchItem,
  type KhartisLegendSwatchType,
  type KhartisLineWidthLegendOptions,
  type KhartisLineWidthLegendStep,
  type KhartisSwatchLegendOptions
} from './khartis-extensions';
export {
  draw_quanti_color_legend,
  round_thresholds,
  type QuantiColorLegendOptions
} from './quantitative';
export {
  draw_symbols_legend,
  type SymbolsLegendOptions,
  type SymbolType
} from './symbols';
export {
  createLegendSvg,
  escapeSvgAttribute,
  escapeSvgText,
  type CommonLegendTextOptions,
  type LegendSvgDefinition
} from './utils';
