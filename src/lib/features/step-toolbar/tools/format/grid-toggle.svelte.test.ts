import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import * as m from '$lib/paraglide/messages';
import GridToggle from './grid-toggle.svelte';
import { formatActions, getFormatState } from './format.store.svelte';

describe('format grid toggle', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('toggles the grid state when the switch is clicked', async () => {
    render(GridToggle);

    const gridSwitch = screen.getByRole('switch', {
      name: m.format_grid()
    });

    expect(getFormatState().gridEnabled).toBe(true);

    await fireEvent.click(gridSwitch);

    expect(getFormatState().gridEnabled).toBe(false);
  });
});
