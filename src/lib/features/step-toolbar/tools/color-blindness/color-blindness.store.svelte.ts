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
>(
  DEFAULT_STATE,
  (s) => ({
    toggleEnabled: () => {
      const nextEnabled = !s.enabled;
      s.enabled = nextEnabled;

      if (!nextEnabled) {
        s.simulationType = ColorBlindnessType.NONE;
      } else if (s.simulationType === ColorBlindnessType.NONE) {
        s.simulationType = ColorBlindnessType.DEUTERANOPIA;
      }
    },
    setSimulationType: (type: ColorBlindnessType) => {
      s.simulationType = type;
      s.enabled = type !== ColorBlindnessType.NONE;
    }
  }),
  { key: 'colorBlindness' }
);

export const colorBlindnessActions = actions;
export const getColorBlindnessState = getState;
