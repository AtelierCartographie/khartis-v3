import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legendActions } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
import LegendOverlay from './legend-overlay.svelte';

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

describe('legend overlay visibility', () => {
  beforeEach(() => {
    cleanup();
    legendActions.reset();
    legendActions.setVisibility(true);
    legendActions.addLegendItem({
      name: 'Population',
      visible: true,
      title: 'Population',
      titleMode: 'custom',
      subtitle: '',
      subtitleMode: 'custom',
      note: '',
      variableId: undefined
    });
  });

  afterEach(() => {
    cleanup();
    legendActions.reset();
  });

  it('renders the legend content when visible', () => {
    render(LegendOverlay);

    expect(screen.getByText('Population')).toBeInTheDocument();
  });

  it('keeps the legend mounted but hidden when requested', () => {
    const { container } = render(LegendOverlay, { hidden: true });

    expect(
      container.querySelector('.legend-overlay.hidden')
    ).toBeInTheDocument();
    expect(screen.getByText('Population')).toBeInTheDocument();
  });
});
