import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/commons/services/classification.service', () => ({
  applyPaletteInversion: (colors: string[]) => colors,
  calculateBreakCounts: vi.fn(async () => null),
  calculateBreaks: vi.fn(async () => null),
  generateColorsForBreaks: vi.fn(() => [])
}));

vi.mock(
  '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte',
  () => ({
    getColorBlindnessState: () => ({ enabled: false })
  })
);

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: { datasets: [] }
}));

import DiscretizationModal from './discretization-modal.svelte';
import DiscretizationPanel from './discretization-panel.svelte';
import {
  ClassificationMethod,
  VisualizationType,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';

function createVisualization(): VisualizationConfig {
  return {
    id: 'viz-1',
    name: 'Visualization',
    type: VisualizationType.CHOROPLETH,
    datasetId: 'dataset-1',
    enabled: true,
    mapping: {},
    style: {},
    classification: {
      method: ClassificationMethod.QUANTILES,
      classes: 5,
      numClasses: 5,
      colors: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08519c']
    }
  } as VisualizationConfig;
}

describe('DiscretizationModal', () => {
  it('offers the full discretization method list, including standard deviation', () => {
    const visualization = createVisualization();
    const { container } = render(DiscretizationModal, {
      open: true,
      visualization
    });
    const panel = container.querySelector('.discretization-floating-panel');

    expect(panel).not.toBeNull();
    const select = container.querySelector(
      '#classification-method'
    ) as HTMLSelectElement | null;

    expect(select).not.toBeNull();
    expect(
      Array.from(select?.options ?? []).map((option) =>
        option.textContent?.trim()
      )
    ).toEqual([
      'K-means (seuils naturels)',
      'Quantiles',
      'Intervalles égaux',
      'Écarts-types',
      'Q6',
      'Moyennes emboîtées',
      'Head/Tail',
      'Manuel'
    ]);
  });

  it('keeps adjacent manual bounds synchronized while editing', async () => {
    const { container } = render(DiscretizationPanel, {
      method: 'manual',
      numClasses: 3,
      breaks: [
        { min: 0, max: 10, count: 1, color: '#111111' },
        { min: 10, max: 20, count: 1, color: '#222222' },
        { min: 20, max: 30, count: 1, color: '#333333' }
      ]
    });

    const maxInput = container.querySelector(
      '#break-max-0'
    ) as HTMLInputElement;
    const adjacentMinInput = container.querySelector(
      '#break-min-1'
    ) as HTMLInputElement;

    await fireEvent.input(maxInput, {
      target: { value: '12' }
    });

    expect(maxInput.value).toBe('12');
    expect(adjacentMinInput.value).toBe('12');
  });

  it('allows clearing the breakpoint value', async () => {
    const onbreakpointchange = vi.fn();
    const { container } = render(DiscretizationPanel, {
      breakpointValue: 9816,
      onbreakpointchange
    });

    const breakpointInput = container.querySelector(
      '#breakpoint-value'
    ) as HTMLInputElement;

    await fireEvent.input(breakpointInput, {
      target: { value: '' }
    });

    expect(onbreakpointchange).toHaveBeenLastCalledWith(null);
    expect(breakpointInput.value).toBe('');
  });
});
