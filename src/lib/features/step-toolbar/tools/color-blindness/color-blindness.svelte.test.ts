import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import * as m from '$lib/paraglide/messages';
import { ColorBlindnessType } from '$lib/features/commons/constants/ui.constants';
import ColorBlindness from './color-blindness.svelte';
import {
  colorBlindnessActions,
  getColorBlindnessState
} from './color-blindness.store.svelte';

describe('color-blindness tool', () => {
  beforeEach(() => {
    colorBlindnessActions.reset();
  });

  it('renders the visual impairments copy and helper text', () => {
    render(ColorBlindness);

    expect(
      screen.getByRole('combobox', {
        name: m.colorblind_simulation()
      })
    ).toBeInTheDocument();
    expect(screen.getByText(m.colorblind_helper_p1())).toBeInTheDocument();
    expect(screen.getByText(m.colorblind_helper_p2())).toBeInTheDocument();
  });

  it('updates the simulation state when a filter is selected', async () => {
    render(ColorBlindness);

    const select = screen.getByRole('combobox', {
      name: m.colorblind_simulation()
    });

    await fireEvent.change(select, {
      target: { value: ColorBlindnessType.DEUTERANOPIA }
    });

    expect(getColorBlindnessState()).toMatchObject({
      simulationType: ColorBlindnessType.DEUTERANOPIA,
      enabled: true
    });
  });
});
