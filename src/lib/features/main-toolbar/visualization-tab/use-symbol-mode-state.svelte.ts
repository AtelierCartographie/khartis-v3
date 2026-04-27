import type {
  SymbolModeState,
  SymbolPrimitiveConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  FillMode,
  ProportionalType,
  StrokeMode,
  SymbolDoublePosition,
  SymbolMode,
  VISUALIZATION_DEFAULTS
} from '$lib/features/main-toolbar/constants';
import { applyByKeys, snapshotByKeys } from './mode-snapshot.utils';

const NON_PROPORTIONAL_SYMBOL_STATE_FIELDS = {
  proportionalType: ProportionalType.SINGLE,
  commonScale: true,
  positionMode: SymbolDoublePosition.OVERLAY,
  breakValueA: null,
  breakValueB: null
} as const satisfies Partial<SymbolPrimitiveConfig>;

export const SYMBOL_MODE_STATE_KEYS = [
  'size',
  'minSize',
  'maxSize',
  'sizeScale',
  'valueColumn',
  'categoryColumn',
  'sizeColumn',
  'classification',
  'fillValueColumn',
  'fillCategoryColumn',
  'fillClassification',
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
  'strokeDashedPattern',
  'strokeClassification',
  'strokeValueColumn',
  'strokeCategoryColumn'
] as const satisfies readonly (keyof SymbolModeState)[];

export function snapshotSymbolModeState(
  symbol: SymbolPrimitiveConfig
): SymbolModeState {
  return snapshotByKeys(symbol, SYMBOL_MODE_STATE_KEYS) as SymbolModeState;
}

export function applySymbolModeStateFields(
  state: SymbolModeState | undefined
): Partial<SymbolPrimitiveConfig> {
  return applyByKeys<SymbolPrimitiveConfig>(state, SYMBOL_MODE_STATE_KEYS);
}

export function getDefaultSymbolModeStateFields(
  mode: SymbolMode
): Partial<SymbolPrimitiveConfig> {
  if (mode === SymbolMode.PROPORTIONAL) {
    return {};
  }

  if (mode !== SymbolMode.CATEGORIES) {
    return { ...NON_PROPORTIONAL_SYMBOL_STATE_FIELDS };
  }

  return {
    ...NON_PROPORTIONAL_SYMBOL_STATE_FIELDS,
    fillMode: FillMode.CATEGORIES,
    strokeMode: StrokeMode.UNIQUE,
    strokeWidth: VISUALIZATION_DEFAULTS.strokeWidth,
    strokeOpacity: 1,
    strokeDashed: false,
    strokeDashedPattern: undefined,
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
  const sanitizedNextModeState =
    nextMode === SymbolMode.PROPORTIONAL
      ? {}
      : NON_PROPORTIONAL_SYMBOL_STATE_FIELDS;

  return {
    nextModeStates: {
      ...existingModeStates,
      [previousMode]: snapshotSymbolModeState(symbol)
    },
    restoredStateFields: nextModeState
      ? {
          ...applySymbolModeStateFields(nextModeState),
          ...sanitizedNextModeState
        }
      : getDefaultSymbolModeStateFields(nextMode)
  };
}
