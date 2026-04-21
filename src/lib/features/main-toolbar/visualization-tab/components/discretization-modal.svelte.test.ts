import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

const modalSource = readFileSync(
  resolve(import.meta.dirname, 'discretization-modal.svelte'),
  'utf8'
);

vi.mock('$lib/features/commons/services/classification.service', () => ({
  applyPaletteInversion: (colors: string[]) => colors,
  calculateBreakCounts: vi.fn(async () => null),
  calculateBreaks: vi.fn(async () => null),
  computeDivergingSplit: vi.fn(() => ({
    lowerCount: 2,
    upperCount: 2,
    hasCenterClass: true
  })),
  generateColorsForBreaks: vi.fn(() => [])
}));

vi.mock(
  '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte',
  () => ({
    getColorBlindnessState: () => ({ enabled: false, simulationType: 'none' }),
    isColorBlindnessActive: () => false
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

function createVisualization(options?: {
  classification?: VisualizationConfig['classification'];
}): VisualizationConfig {
  const hasClassificationOverride = Boolean(
    options && 'classification' in options
  );

  return {
    id: 'viz-1',
    name: 'Visualization',
    type: VisualizationType.CHOROPLETH,
    datasetId: 'dataset-1',
    enabled: true,
    mapping: {},
    style: {},
    classification: hasClassificationOverride
      ? options?.classification
      : {
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
      'Jenks',
      'Quantiles',
      'Intervalles égaux',
      'Écarts-types',
      'Q6',
      'Moyennes emboîtées',
      'Head/Tail',
      'Manuel'
    ]);
  });

  it('defaults the discretization select to Jenks when no method is configured', () => {
    const visualization = createVisualization({ classification: undefined });
    const { container } = render(DiscretizationModal, {
      open: true,
      visualization
    });

    const select = container.querySelector(
      '#classification-method'
    ) as HTMLSelectElement | null;

    expect(select).not.toBeNull();
    expect(select?.value).toBe('jenks');
  });

  it('should update both adjacent bounds when editing a shared break value in manual mode', async () => {
    const onbreakschange = vi.fn();
    const { container } = render(DiscretizationPanel, {
      method: 'manual',
      numClasses: 3,
      breaks: [
        { min: 0, max: 10, count: 1, color: '#111111' },
        { min: 10, max: 20, count: 1, color: '#222222' },
        { min: 20, max: 30, count: 1, color: '#333333' }
      ],
      onbreakschange
    });

    const sharedBoundInput = container.querySelector(
      '#break-value-1'
    ) as HTMLInputElement;

    expect(sharedBoundInput).not.toBeNull();
    expect(sharedBoundInput.value).toBe('10');

    await fireEvent.input(sharedBoundInput, {
      target: { value: '12' }
    });
    await fireEvent.blur(sharedBoundInput);

    expect(onbreakschange).toHaveBeenCalled();
    const lastCall =
      onbreakschange.mock.calls[onbreakschange.mock.calls.length - 1][0];
    expect(lastCall[0].max).toBe(12);
    expect(lastCall[1].min).toBe(12);
  });

  it('should include paletteId and inverted in the onchange payload', () => {
    expect(modalSource).toContain('paletteId: activeClassification?.paletteId');
    expect(modalSource).toContain(
      'inverted: activeClassification?.inverted ?? false'
    );
  });

  it('should allow a stroke-specific valueColumn override instead of always reading visualization.mapping.valueColumn', () => {
    expect(modalSource).toContain('valueColumn?: string;');
    expect(modalSource).toContain('const activeValueColumn = $derived(');
    expect(modalSource).toContain(
      'valueColumn ?? visualization?.mapping.valueColumn'
    );
  });

  it('should use a single opening effect to avoid redundant state syncs', () => {
    const openingSyncMatches = modalSource.match(
      /syncStateFromVisualization\(activeClassification\)/g
    );
    expect(openingSyncMatches).not.toBeNull();
    expect(openingSyncMatches!.length).toBeLessThanOrEqual(2);
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
