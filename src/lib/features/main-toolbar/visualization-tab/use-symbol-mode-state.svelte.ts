import type {
  SymbolModeState,
  SymbolPrimitiveConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  FillMode,
  StrokeMode,
  SymbolMode,
  VISUALIZATION_DEFAULTS
} from '$lib/features/main-toolbar/constants';

export function snapshotSymbolModeState(
  symbol: SymbolPrimitiveConfig
): SymbolModeState {
  return {
    size: symbol.size,
    minSize: symbol.minSize,
    maxSize: symbol.maxSize,
    sizeScale: symbol.sizeScale,
    valueColumn: symbol.valueColumn,
    categoryColumn: symbol.categoryColumn,
    sizeColumn: symbol.sizeColumn,
    classification: symbol.classification,
    categoryShape: symbol.categoryShape,
    proportionalType: symbol.proportionalType,
    commonScale: symbol.commonScale,
    positionMode: symbol.positionMode,
    breakValueA: symbol.breakValueA,
    breakValueB: symbol.breakValueB,
    fillMode: symbol.fillMode,
    strokeMode: symbol.strokeMode,
    strokeWidth: symbol.strokeWidth,
    strokeOpacity: symbol.strokeOpacity,
    strokeDashed: symbol.strokeDashed,
    strokeClassification: symbol.strokeClassification,
    strokeValueColumn: symbol.strokeValueColumn,
    strokeCategoryColumn: symbol.strokeCategoryColumn
  };
}

export const SYMBOL_MODE_STATE_KEYS = [
  'size',
  'minSize',
  'maxSize',
  'sizeScale',
  'valueColumn',
  'categoryColumn',
  'sizeColumn',
  'classification',
  'categoryShape',
  'proportionalType',
  'commonScale',
  'positionMode',
  'breakValueA',
  'breakValueB',
  'fillMode',
  'strokeMode',
  'strokeWidth',
  'strokeOpacity',
  'strokeDashed',
  'strokeClassification',
  'strokeValueColumn',
  'strokeCategoryColumn'
] as const satisfies readonly (keyof SymbolModeState)[];

export function applySymbolModeStateFields(
  state: SymbolModeState | undefined
): Partial<SymbolPrimitiveConfig> {
  const fields: Partial<SymbolPrimitiveConfig> = {};
  for (const key of SYMBOL_MODE_STATE_KEYS) {
    (fields as Record<string, unknown>)[key] = state?.[key];
  }
  return fields;
}

export function getDefaultSymbolModeStateFields(
  mode: SymbolMode
): Partial<SymbolPrimitiveConfig> {
  if (mode !== SymbolMode.CATEGORIES) {
    return {};
  }

  return {
    fillMode: FillMode.CATEGORIES,
    strokeMode: StrokeMode.NONE,
    strokeWidth: VISUALIZATION_DEFAULTS.strokeWidth,
    strokeOpacity: 1,
    strokeDashed: false,
    strokeClassification: undefined,
    strokeValueColumn: undefined,
    strokeCategoryColumn: undefined
  };
}

export function resolveSymbolModeTransition(
  symbol: SymbolPrimitiveConfig,
  nextMode: SymbolMode
): {
  nextModeStates: NonNullable<SymbolPrimitiveConfig['modeStates']>;
  restoredStateFields: Partial<SymbolPrimitiveConfig>;
} {
  const previousMode = symbol.mode;
  const existingModeStates = symbol.modeStates ?? {};
  const nextModeState = existingModeStates[nextMode];

  return {
    nextModeStates: {
      ...existingModeStates,
      [previousMode]: snapshotSymbolModeState(symbol)
    },
    restoredStateFields: nextModeState
      ? applySymbolModeStateFields(nextModeState)
      : getDefaultSymbolModeStateFields(nextMode)
  };
}
