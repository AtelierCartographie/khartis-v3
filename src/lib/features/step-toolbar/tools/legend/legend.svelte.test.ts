import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    version: 0,
    visualizations: []
  }
}));

import Legend from './legend.svelte';
import { legendActions } from './legend.store.svelte';

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
});
