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
    setSimulationType: (type: ColorBlindnessType) => void;
  }
>(
  DEFAULT_STATE,
  (s) => ({
    setSimulationType: (type: ColorBlindnessType) => {
      s.simulationType = type;
      s.enabled = type !== ColorBlindnessType.NONE;
    }
  }),
  { key: 'colorBlindness' }
);

export const colorBlindnessActions = actions;
export const getColorBlindnessState = getState;
