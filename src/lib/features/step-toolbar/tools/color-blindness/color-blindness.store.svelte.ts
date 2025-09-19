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
  setState(newState: Partial<ColorBlindnessState>): void {
    Object.assign(colorBlindnessState, newState);
  },

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

  testVisionTypes(): void {
    const types = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

    types.forEach((type, index) => {
      setTimeout(() => {}, index * 1000);
    });
  },

  reset(): void {
    Object.assign(colorBlindnessState, DEFAULT_COLOR_BLINDNESS_STATE);
  }
};

export function isSimulationActive(): boolean {
  return (
    colorBlindnessState.enabled && colorBlindnessState.simulationType !== 'none'
  );
}
