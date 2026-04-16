import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageModel } from '$lib/features/commons/constants/ui.constants';
import { formatActions } from '../format/format.store.svelte';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    version: 0,
    visualizations: []
  }
}));

import { getLegendState, legendActions } from './legend.store.svelte';

describe('legend store responsive defaults', () => {
  beforeEach(() => {
    formatActions.reset();
    legendActions.reset();
  });

  it('adapts pristine legend font size to the current page profile', () => {
    formatActions.setModel(PageModel.A3_LANDSCAPE);

    legendActions.syncWithVisualizations();

    expect(getLegendState().style.fontSize).toBe(11);
  });

  it('does not overwrite a customized legend font size after the tool was opened', () => {
    formatActions.setModel(PageModel.SCREEN_LANDSCAPE);
    legendActions.updateStyle({ fontSize: 20 });
    legendActions.markAsOpened();

    legendActions.syncWithVisualizations();

    expect(getLegendState().style.fontSize).toBe(20);
  });
});
