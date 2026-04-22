import { beforeEach, describe, expect, it } from 'vitest';
import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';
import {
  colorBlindnessActions,
  getColorBlindnessState,
  isColorBlindnessActive
} from './color-blindness.store.svelte';

describe('color-blindness store', () => {
  beforeEach(() => {
    colorBlindnessActions.reset();
  });

  it('marks the simulation active when a non-none type is selected', () => {
    colorBlindnessActions.setSimulationType(ColorBlindnessType.PROTANOPIA);

    expect(isColorBlindnessActive(getColorBlindnessState())).toBe(true);
  });

  it('treats legacy persisted states with a simulation type as active', () => {
    colorBlindnessActions.setState({
      simulationType: ColorBlindnessType.DEUTERANOPIA,
      enabled: false
    });

    expect(isColorBlindnessActive(getColorBlindnessState())).toBe(true);
  });

  it('treats the none simulation as inactive even if enabled drifted to true', () => {
    colorBlindnessActions.setState({
      simulationType: ColorBlindnessType.NONE,
      enabled: true
    });

    expect(isColorBlindnessActive(getColorBlindnessState())).toBe(false);
  });
});
