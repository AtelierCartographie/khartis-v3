import { beforeEach, describe, expect, it } from 'vitest';
import {
  colorBlindnessActions,
  getColorBlindnessState
} from './color-blindness.store.svelte';
import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';

describe('color-blindness store', () => {
  beforeEach(() => {
    colorBlindnessActions.reset();
  });

  it('is disabled with no simulation by default', () => {
    const state = getColorBlindnessState();

    expect(state.enabled).toBe(false);
    expect(state.simulationType).toBe(ColorBlindnessType.NONE);
  });

  it('enables deuteranopia when toggled from default state', () => {
    colorBlindnessActions.toggleEnabled();

    const state = getColorBlindnessState();
    expect(state.enabled).toBe(true);
    expect(state.simulationType).toBe(ColorBlindnessType.DEUTERANOPIA);
  });

  it('resets simulation type to none when toggled off', () => {
    colorBlindnessActions.setSimulationType(ColorBlindnessType.TRITANOPIA);
    colorBlindnessActions.toggleEnabled();

    const state = getColorBlindnessState();
    expect(state.enabled).toBe(false);
    expect(state.simulationType).toBe(ColorBlindnessType.NONE);
  });

  it('keeps enabled flag in sync when simulation type is set explicitly', () => {
    colorBlindnessActions.setSimulationType(ColorBlindnessType.PROTANOPIA);
    expect(getColorBlindnessState().enabled).toBe(true);

    colorBlindnessActions.setSimulationType(ColorBlindnessType.NONE);
    expect(getColorBlindnessState().enabled).toBe(false);
  });
});
