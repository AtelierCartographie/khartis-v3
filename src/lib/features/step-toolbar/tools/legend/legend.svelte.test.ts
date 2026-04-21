import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    version: 0,
    visualizations: []
  }
}));

import Legend from './legend.svelte';
import { getLegendState, legendActions } from './legend.store.svelte';

describe('legend tool', () => {
  beforeEach(() => {
    legendActions.reset();
    legendActions.addLegendItem({
      name: 'Population',
      visible: true,
      title: 'Population',
      titleMode: 'custom',
      subtitle: '2024',
      subtitleMode: 'custom',
      note: '',
      variableId: undefined
    });
  });

  it('collapses the item editor when its visibility toggle is turned off', async () => {
    render(Legend);

    expect(screen.getByLabelText(/^Titre$/i)).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('switch', { name: /population/i }));

    expect(screen.queryByLabelText(/^Titre$/i)).not.toBeInTheDocument();
  });

  it('updates legend item text fields from the content tab', async () => {
    render(Legend);

    await fireEvent.input(screen.getByLabelText(/^Titre$/i), {
      target: { value: 'Titre édité' }
    });
    await fireEvent.input(screen.getByLabelText(/^Sous-titre$/i), {
      target: { value: 'Sous-titre édité' }
    });
    await fireEvent.input(screen.getByLabelText(/^Note$/i), {
      target: { value: 'Note éditée' }
    });

    expect(getLegendState().items[0]).toMatchObject({
      title: 'Titre édité',
      titleMode: 'custom',
      subtitle: 'Sous-titre édité',
      subtitleMode: 'custom',
      note: 'Note éditée'
    });
  });

  it('updates the global legend style from the style tab controls', async () => {
    render(Legend);

    await fireEvent.click(screen.getByRole('button', { name: /style/i }));

    expect(
      screen.queryByRole('button', { name: /^decrement$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^increment$/i })
    ).not.toBeInTheDocument();

    await fireEvent.change(screen.getByRole('combobox', { name: /police/i }), {
      target: { value: 'Inter' }
    });
    await fireEvent.change(screen.getByRole('combobox', { name: /taille/i }), {
      target: { value: '24' }
    });
    await fireEvent.input(screen.getByRole('spinbutton'), {
      target: { value: '42' }
    });
    await fireEvent.click(
      screen.getByRole('switch', { name: /arrière plan/i })
    );

    expect(getLegendState().style.fontFamily).toBe('Inter');
    expect(getLegendState().style.fontSize).toBe(24);
    expect(getLegendState().style.background.opacity).toBe(42);
    expect(getLegendState().style.background.enabled).toBe(false);
  });
});
