import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DiscretizationRow from './discretization-row.svelte';

const source = readFileSync(
  resolve(import.meta.dirname, 'discretization-row.svelte'),
  'utf8'
);

describe('DiscretizationRow', () => {
  it('accepts a custom settingsIconDescription for non-discretization actions', () => {
    expect(source).toContain('settingsIconDescription?: string;');
    expect(source).toContain(
      'settingsIconDescription = m.discretization_settings()'
    );
    expect(source).toContain('iconDescription={settingsIconDescription}');
  });

  it('forwards the click event to the caller so the parent can stop propagation when needed', () => {
    expect(source).toContain('onsettings?: (event: MouseEvent) => void;');
    expect(source).toContain('onclick={onsettings}');
  });

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
