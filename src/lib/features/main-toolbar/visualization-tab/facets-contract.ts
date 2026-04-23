export const FACET_SLOT = {
  SYMBOL_VALUE: 'symbol.valueColumn',
  SYMBOL_CATEGORY: 'symbol.categoryColumn',
  SYMBOL_SIZE: 'symbol.sizeColumn',
  SYMBOL_FILL_VALUE: 'symbol.fillValueColumn',
  SYMBOL_FILL_CATEGORY: 'symbol.fillCategoryColumn',
  POLYGON_VALUE: 'polygon.valueColumn',
  POLYGON_CATEGORY: 'polygon.categoryColumn',
  LINE_VALUE: 'line.valueColumn',
  LINE_CATEGORY: 'line.categoryColumn',
  LINE_SIZE: 'line.sizeColumn',
  TEXT_VALUE: 'text.valueColumn',
  TEXT_CATEGORY: 'text.categoryColumn',
  TEXT_BACKGROUND_VALUE: 'text.background.valueColumn',
  TEXT_BACKGROUND_CATEGORY: 'text.background.categoryColumn',
  TEXT_BACKGROUND_STROKE_VALUE: 'text.background.strokeValueColumn',
  TEXT_BACKGROUND_STROKE_CATEGORY: 'text.background.strokeCategoryColumn'
} as const;

export type FacetSlotPath = (typeof FACET_SLOT)[keyof typeof FACET_SLOT];
