import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DiscretizationRow from './discretization-row.svelte';

describe('DiscretizationRow', () => {
  it('opens the shared settings action when the icon button is clicked', async () => {
    const onsettings = vi.fn();
    const { getByRole } = render(DiscretizationRow, {
      label: 'Discrétisation',
      value: 'Jenks',
      onsettings
    });

    await fireEvent.click(
      getByRole('button', { name: 'Paramètres de discrétisation' })
    );

    expect(onsettings).toHaveBeenCalledTimes(1);
  });
});
