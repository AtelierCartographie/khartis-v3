import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  globalActions,
  globalState
} from '$lib/features/commons/store/global.svelte';
import { ToolbarStep } from '$lib/features/commons/types/global';
import {
  getLegendState,
  legendActions
} from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
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

describe('legend overlay step visibility', () => {
  beforeEach(() => {
    cleanup();
    globalActions.resetNavigationState();
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
    globalActions.resetNavigationState();
    globalState.selectedTool = undefined;
    legendActions.reset();
  });

  it('renders the legend in the styling step', () => {
    globalActions.setNavigationState(ToolbarStep.Styling);

    render(LegendOverlay);

    expect(screen.getByText('Population')).toBeInTheDocument();
  });

  it('hides the legend in the visualizations step', () => {
    globalActions.setNavigationState(ToolbarStep.Visualizations);

    render(LegendOverlay);

    expect(screen.queryByText('Population')).not.toBeInTheDocument();
    expect(getLegendState().visible).toBe(true);
  });
});
