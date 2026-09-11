export const SCALE_MODE = {
  SHARED: 'shared',
  INDEPENDENT: 'independent'
} as const;

export type ScaleMode = (typeof SCALE_MODE)[keyof typeof SCALE_MODE];

export const FACET_SLOT = {
  SYMBOL_VALUE: 'symbol.valueColumn',
  SYMBOL_CATEGORY: 'symbol.categoryColumn',
  SYMBOL_SIZE: 'symbol.sizeColumn',
  SYMBOL_FILL_VALUE: 'symbol.fillValueColumn',
  SYMBOL_FILL_CATEGORY: 'symbol.fillCategoryColumn',
  SYMBOL_STROKE_VALUE: 'symbol.strokeValueColumn',
  SYMBOL_STROKE_CATEGORY: 'symbol.strokeCategoryColumn',
  POLYGON_VALUE: 'polygon.valueColumn',
  POLYGON_CATEGORY: 'polygon.categoryColumn',
  POLYGON_STROKE_VALUE: 'polygon.strokeValueColumn',
  POLYGON_STROKE_CATEGORY: 'polygon.strokeCategoryColumn',
  LINE_VALUE: 'line.valueColumn',
  LINE_CATEGORY: 'line.categoryColumn',
  LINE_SIZE: 'line.sizeColumn',
  LINE_THICKNESS_VALUE: 'line.thicknessValueColumn',
  TEXT_VALUE: 'text.valueColumn',
  TEXT_CATEGORY: 'text.categoryColumn'
} as const;

export type FacetSlotPath = (typeof FACET_SLOT)[keyof typeof FACET_SLOT];

export type FacetMappingKey = 'valueColumn' | 'categoryColumn' | 'sizeColumn';
export type FacetVariableKind = 'numeric' | 'textual';
export type FacetClassificationTarget =
  | 'symbol'
  | 'symbol-fill'
  | 'symbol-stroke'
  | 'polygon-fill'
  | 'polygon-stroke'
  | 'line-color'
  | 'line-thickness'
  | 'text';

export interface FacetSlotDefinition {
  path: FacetSlotPath;
  mappingKey: FacetMappingKey;
  variableKind: FacetVariableKind;
  classificationTarget: FacetClassificationTarget;
  recomputeIndependentBreaks: boolean;
}

export const FACET_SLOT_DEFINITIONS = {
  [FACET_SLOT.SYMBOL_VALUE]: {
    path: FACET_SLOT.SYMBOL_VALUE,
    mappingKey: 'valueColumn',
    variableKind: 'numeric',
    classificationTarget: 'symbol',
    recomputeIndependentBreaks: true
  },
  [FACET_SLOT.SYMBOL_CATEGORY]: {
    path: FACET_SLOT.SYMBOL_CATEGORY,
    mappingKey: 'categoryColumn',
    variableKind: 'textual',
    classificationTarget: 'symbol',
    recomputeIndependentBreaks: false
  },
  [FACET_SLOT.SYMBOL_SIZE]: {
    path: FACET_SLOT.SYMBOL_SIZE,
    mappingKey: 'sizeColumn',
    variableKind: 'numeric',
    classificationTarget: 'symbol',
    recomputeIndependentBreaks: false
  },
  [FACET_SLOT.SYMBOL_FILL_VALUE]: {
    path: FACET_SLOT.SYMBOL_FILL_VALUE,
    mappingKey: 'valueColumn',
    variableKind: 'numeric',
    classificationTarget: 'symbol-fill',
    recomputeIndependentBreaks: true
  },
  [FACET_SLOT.SYMBOL_FILL_CATEGORY]: {
    path: FACET_SLOT.SYMBOL_FILL_CATEGORY,
    mappingKey: 'categoryColumn',
    variableKind: 'textual',
    classificationTarget: 'symbol-fill',
    recomputeIndependentBreaks: false
  },
  [FACET_SLOT.SYMBOL_STROKE_VALUE]: {
    path: FACET_SLOT.SYMBOL_STROKE_VALUE,
    mappingKey: 'valueColumn',
    variableKind: 'numeric',
    classificationTarget: 'symbol-stroke',
    recomputeIndependentBreaks: true
  },
  [FACET_SLOT.SYMBOL_STROKE_CATEGORY]: {
    path: FACET_SLOT.SYMBOL_STROKE_CATEGORY,
    mappingKey: 'categoryColumn',
    variableKind: 'textual',
    classificationTarget: 'symbol-stroke',
    recomputeIndependentBreaks: false
  },
  [FACET_SLOT.POLYGON_VALUE]: {
    path: FACET_SLOT.POLYGON_VALUE,
    mappingKey: 'valueColumn',
    variableKind: 'numeric',
    classificationTarget: 'polygon-fill',
    recomputeIndependentBreaks: true
  },
  [FACET_SLOT.POLYGON_CATEGORY]: {
    path: FACET_SLOT.POLYGON_CATEGORY,
    mappingKey: 'categoryColumn',
    variableKind: 'textual',
    classificationTarget: 'polygon-fill',
    recomputeIndependentBreaks: false
  },
  [FACET_SLOT.POLYGON_STROKE_VALUE]: {
    path: FACET_SLOT.POLYGON_STROKE_VALUE,
    mappingKey: 'valueColumn',
    variableKind: 'numeric',
    classificationTarget: 'polygon-stroke',
    recomputeIndependentBreaks: true
  },
  [FACET_SLOT.POLYGON_STROKE_CATEGORY]: {
    path: FACET_SLOT.POLYGON_STROKE_CATEGORY,
    mappingKey: 'categoryColumn',
    variableKind: 'textual',
    classificationTarget: 'polygon-stroke',
    recomputeIndependentBreaks: false
  },
  [FACET_SLOT.LINE_VALUE]: {
    path: FACET_SLOT.LINE_VALUE,
    mappingKey: 'valueColumn',
    variableKind: 'numeric',
    classificationTarget: 'line-color',
    recomputeIndependentBreaks: true
  },
  [FACET_SLOT.LINE_CATEGORY]: {
    path: FACET_SLOT.LINE_CATEGORY,
    mappingKey: 'categoryColumn',
    variableKind: 'textual',
    classificationTarget: 'line-color',
    recomputeIndependentBreaks: false
  },
  [FACET_SLOT.LINE_SIZE]: {
    path: FACET_SLOT.LINE_SIZE,
    mappingKey: 'sizeColumn',
    variableKind: 'numeric',
    classificationTarget: 'line-thickness',
    recomputeIndependentBreaks: false
  },
  [FACET_SLOT.LINE_THICKNESS_VALUE]: {
    path: FACET_SLOT.LINE_THICKNESS_VALUE,
    mappingKey: 'valueColumn',
    variableKind: 'numeric',
    classificationTarget: 'line-thickness',
    recomputeIndependentBreaks: true
  },
  [FACET_SLOT.TEXT_VALUE]: {
    path: FACET_SLOT.TEXT_VALUE,
    mappingKey: 'valueColumn',
    variableKind: 'numeric',
    classificationTarget: 'text',
    recomputeIndependentBreaks: true
  },
  [FACET_SLOT.TEXT_CATEGORY]: {
    path: FACET_SLOT.TEXT_CATEGORY,
    mappingKey: 'categoryColumn',
    variableKind: 'textual',
    classificationTarget: 'text',
    recomputeIndependentBreaks: false
  }
} satisfies Record<FacetSlotPath, FacetSlotDefinition>;

export function isFacetSlotPath(value: unknown): value is FacetSlotPath {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(FACET_SLOT_DEFINITIONS, value)
  );
}

export function getFacetSlotDefinition(
  slotPath: FacetSlotPath
): FacetSlotDefinition {
  return FACET_SLOT_DEFINITIONS[slotPath];
}

export function getFacetMappingKey(slotPath: FacetSlotPath): FacetMappingKey {
  return getFacetSlotDefinition(slotPath).mappingKey;
}

export function facetSlotRequiresNumericVariable(
  slotPath: FacetSlotPath
): boolean {
  return getFacetSlotDefinition(slotPath).variableKind === 'numeric';
}

export function isFacetCategorySlot(slotPath: FacetSlotPath): boolean {
  return getFacetSlotDefinition(slotPath).variableKind === 'textual';
}

export function facetSlotRecomputesIndependentBreaks(
  slotPath: FacetSlotPath
): boolean {
  return getFacetSlotDefinition(slotPath).recomputeIndependentBreaks;
}
