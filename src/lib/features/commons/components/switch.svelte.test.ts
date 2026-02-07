import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Switch from './switch.svelte';

afterEach(cleanup);

describe('Switch', () => {
  it('renders an unchecked switch by default', () => {
    render(Switch, { props: { labelText: 'My switch', hideLabel: true } });

    const input = screen.getByRole('switch', { name: 'My switch' });
    expect(input).not.toBeChecked();
  });

  it('calls onchange with updated checked value', async () => {
    const onchange = vi.fn();

    render(Switch, {
      props: { toggled: false, labelText: 'My switch', hideLabel: true, onchange }
    });

    const input = screen.getByRole('switch', { name: 'My switch' });
    await fireEvent.click(input);

    expect(onchange).toHaveBeenCalledWith(true);
  });

  it('shows the current state label when enabled', async () => {
    const { rerender } = render(Switch, {
      props: {
        toggled: false,
        labelText: 'Projection',
        hideLabel: true,
        showStateLabel: true,
        labelA: 'Mercator',
        labelB: 'Globe'
      }
    });

    expect(screen.getByText('Mercator')).toBeInTheDocument();

    await rerender({
      toggled: true,
      labelText: 'Projection',
      hideLabel: true,
      showStateLabel: true,
      labelA: 'Mercator',
      labelB: 'Globe'
    });

    expect(screen.getByText('Globe')).toBeInTheDocument();
  });
});
