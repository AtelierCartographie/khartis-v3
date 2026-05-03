import type {
  TextColorModeState,
  TextPrimitiveConfig,
  TextSizeModeState
} from '$lib/features/commons/store/visualization.store.svelte';
import { ColorMode, SizeMode } from '../../constants';
import { applyByKeys, snapshotByKeys } from '../utils/mode-snapshot.utils';

const TEXT_COLOR_MODE_STATE_KEYS = [
  'color',
  'valueColumn',
  'categoryColumn',
  'classification'
] as const satisfies readonly (keyof TextColorModeState)[];

const TEXT_SIZE_MODE_STATE_KEYS = [
  'size',
  'valueColumn',
  'classification'
] as const satisfies readonly (keyof TextSizeModeState)[];

export function snapshotTextColorModeState(
  text: TextPrimitiveConfig
): TextColorModeState {
  return snapshotByKeys(text, TEXT_COLOR_MODE_STATE_KEYS) as TextColorModeState;
}

export function snapshotTextSizeModeState(
  text: TextPrimitiveConfig
): TextSizeModeState {
  return snapshotByKeys(text, TEXT_SIZE_MODE_STATE_KEYS) as TextSizeModeState;
}

export function applyTextColorModeStateFields(
  state: TextColorModeState | undefined
): Partial<TextPrimitiveConfig> {
  return applyByKeys<TextPrimitiveConfig>(state, TEXT_COLOR_MODE_STATE_KEYS);
}

export function applyTextSizeModeStateFields(
  state: TextSizeModeState | undefined
): Partial<TextPrimitiveConfig> {
  return applyByKeys<TextPrimitiveConfig>(state, TEXT_SIZE_MODE_STATE_KEYS);
}

function getDefaultTextColorModeState(
  mode: ColorMode
): Partial<TextPrimitiveConfig> {
  if (mode === ColorMode.UNIQUE) {
    return {};
  }
  return {
    valueColumn: undefined,
    categoryColumn: undefined,
    classification: undefined
  };
}

function getDefaultTextSizeModeState(
  mode: SizeMode
): Partial<TextPrimitiveConfig> {
  if (mode === SizeMode.PROPORTIONAL) {
    return { valueColumn: undefined, classification: undefined };
  }
  return {};
}

export function resolveTextColorModeTransition(
  text: TextPrimitiveConfig,
  nextMode: ColorMode
): {
  nextColorModeStates: NonNullable<TextPrimitiveConfig['colorModeStates']>;
  restoredColorFields: Partial<TextPrimitiveConfig>;
} {
  const previousMode = text.colorMode;
  const existingStates = text.colorModeStates ?? {};
  const savedState = existingStates[nextMode];

  return {
    nextColorModeStates: {
      ...existingStates,
      [previousMode]: snapshotTextColorModeState(text)
    },
    restoredColorFields: savedState
      ? applyTextColorModeStateFields(savedState)
      : getDefaultTextColorModeState(nextMode)
  };
}

export function resolveTextSizeModeTransition(
  text: TextPrimitiveConfig,
  nextMode: SizeMode
): {
  nextSizeModeStates: NonNullable<TextPrimitiveConfig['sizeModeStates']>;
  restoredSizeFields: Partial<TextPrimitiveConfig>;
} {
  const previousMode = text.sizeMode;
  const existingStates = text.sizeModeStates ?? {};
  const savedState = existingStates[nextMode];

  return {
    nextSizeModeStates: {
      ...existingStates,
      [previousMode]: snapshotTextSizeModeState(text)
    },
    restoredSizeFields: savedState
      ? applyTextSizeModeStateFields(savedState)
      : getDefaultTextSizeModeState(nextMode)
  };
}
