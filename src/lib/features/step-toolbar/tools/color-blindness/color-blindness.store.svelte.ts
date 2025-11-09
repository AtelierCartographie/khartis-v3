import { createResetFunction } from '$lib/features/commons/utils/store.utils';
import type { ColorBlindnessState } from './color-blindness.types';

const DEFAULT_COLOR_BLINDNESS_STATE: ColorBlindnessState = {
  simulationType: 'none',
  enabled: false
};

export const colorBlindnessState = $state<ColorBlindnessState>({
  ...DEFAULT_COLOR_BLINDNESS_STATE
});

export function getColorBlindnessState(): ColorBlindnessState {
  return colorBlindnessState;
}

export const colorBlindnessActions = {
  toggleEnabled(): void {
    colorBlindnessState.enabled = !colorBlindnessState.enabled;
  },

  setSimulationType(
    type:
      | 'none'
      | 'protanopia'
      | 'deuteranopia'
      | 'tritanopia'
      | 'protanomaly'
      | 'deuteranomaly'
      | 'tritanomaly'
      | 'achromatopsia'
      | 'achromatomaly'
  ): void {
    colorBlindnessState.simulationType = type;
  },

  reset: createResetFunction(colorBlindnessState, DEFAULT_COLOR_BLINDNESS_STATE)
};

export function isSimulationActive(): boolean {
  return (
    colorBlindnessState.enabled && colorBlindnessState.simulationType !== 'none'
  );
}
