import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import type { ColorBlindnessState } from './color-blindness.types';

const DEFAULT_STATE: ColorBlindnessState = {
  simulationType: ColorBlindnessType.NONE,
  enabled: false
};

const { actions, getState } = createToolStore<
  ColorBlindnessState,
  {
    toggleEnabled: () => void;
    setSimulationType: (type: ColorBlindnessType) => void;
  }
>(DEFAULT_STATE, (s) => ({
  toggleEnabled: () => {
    s.enabled = !s.enabled;
  },
  setSimulationType: (type: ColorBlindnessType) => {
    s.simulationType = type;
  }
}));

export const colorBlindnessActions = actions;
export const getColorBlindnessState = getState;
