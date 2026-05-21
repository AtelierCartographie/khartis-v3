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

vi.mock('$lib/features/step-toolbar/tools/color-blindness', () => ({
  getColorBlindnessState: () => ({ enabled: false, simulationType: 'none' }),
  isColorBlindnessActive: () => false
}));
vi.mock(
  '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte',
  () => ({
    getColorBlindnessState: () => ({ enabled: false, simulationType: 'none' }),
    isColorBlindnessActive: () => false
  })
);

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: { datasets: [] }
}));

import DiscretizationModal from './discretization-modal.svelte';
import DiscretizationPanel from './discretization-panel.svelte';
import {
  ClassificationMethod,
  VisualizationType,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { ShapeType } from '$lib/features/commons/constants/visualization.constants';

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
  it('offers the SQL discretization methods plus manual', () => {
    const visualization = createVisualization();
    render(DiscretizationModal, {
      open: true,
      visualization,
      classification: visualization.classification,
      valueColumn: visualization.mapping.valueColumn
    });
    const panel = document.body.querySelector('.discretization-floating-panel');

    expect(panel).not.toBeNull();
    const select = document.body.querySelector(
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
      'Q6',
      'Moyennes emboîtées',
      'Head/Tail',
      'Manuel'
    ]);
  });

  it('defaults the discretization select to K-means when no method is configured', () => {
    const visualization = createVisualization({ classification: undefined });
    render(DiscretizationModal, {
      open: true,
      visualization
    });

    const select = document.body.querySelector(
      '#classification-method'
    ) as HTMLSelectElement | null;

    expect(select).not.toBeNull();
    expect(select?.value).toBe('kmeans');
  });

  it('does not fall back to the root classification when a channel override is undefined', () => {
    const visualization = createVisualization();
    render(DiscretizationModal, {
      open: true,
      visualization,
      classification: undefined,
      valueColumn: 'stroke_value',
      role: 'stroke'
    });

    const select = document.body.querySelector(
      '#classification-method'
    ) as HTMLSelectElement | null;

    expect(select).not.toBeNull();
    expect(select?.value).toBe('kmeans');
  });

  it('keeps method changes local until breaks can be recomputed', async () => {
    const onchange = vi.fn();
    const visualization = createVisualization({
      classification: {
        method: ClassificationMethod.KMEANS,
        classes: 5,
        numClasses: 5,
        breaks: [12, 24, 36, 48],
        counts: [1, 1, 1, 1, 1],
        colors: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08519c'],
        labels: ['Category A'],
        disabledLabels: ['Category A'],
        categoryShapes: [ShapeType.CIRCLE]
      }
    });
    render(DiscretizationModal, {
      open: true,
      visualization,
      onchange
    });

    const select = document.body.querySelector(
      '#classification-method'
    ) as HTMLSelectElement | null;

    expect(select).not.toBeNull();

    await fireEvent.change(select!, {
      target: { value: 'quantile' }
    });

    expect(onchange).not.toHaveBeenCalled();
    expect(select?.value).toBe('quantile');
  });

  it('keeps the local method choice when the parent props have not caught up yet', async () => {
    const initialClassification = {
      method: ClassificationMethod.KMEANS,
      classes: 5,
      numClasses: 5,
      breaks: [12, 24, 36, 48],
      counts: [1, 1, 1, 1, 1],
      colors: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08519c']
    };
    const visualization = createVisualization({
      classification: initialClassification
    });
    const onchange = vi.fn();
    const { rerender } = render(DiscretizationModal, {
      open: true,
      visualization,
      classification: initialClassification,
      onchange
    });

    const select = document.body.querySelector(
      '#classification-method'
    ) as HTMLSelectElement | null;

    expect(select).not.toBeNull();

    await fireEvent.change(select!, {
      target: { value: 'quantile' }
    });

    await rerender({
      open: false,
      visualization,
      classification: initialClassification,
      onchange
    });
    await rerender({
      open: true,
      visualization,
      classification: initialClassification,
      onchange
    });

    const reopenedSelect = document.body.querySelector(
      '#classification-method'
    ) as HTMLSelectElement | null;

    expect(reopenedSelect).not.toBeNull();
    expect(reopenedSelect?.value).toBe('quantile');
  });

  it('propagates the selected method change from the panel to the parent callback', async () => {
    const onmethodchange = vi.fn();
    const { container } = render(DiscretizationPanel, {
      method: 'kmeans',
      numClasses: 5,
      breaks: [
        { min: 0, max: 10, count: 1, color: '#111111' },
        { min: 10, max: 20, count: 1, color: '#222222' },
        { min: 20, max: 30, count: 1, color: '#333333' },
        { min: 30, max: 40, count: 1, color: '#444444' },
        { min: 40, max: 50, count: 1, color: '#555555' }
      ],
      onmethodchange
    });

    const select = container.querySelector(
      '#classification-method'
    ) as HTMLSelectElement | null;

    expect(select).not.toBeNull();

    await fireEvent.change(select!, {
      target: { value: 'equal-interval' }
    });

    expect(onmethodchange).toHaveBeenCalledWith('equal-interval');
    expect(select?.value).toBe('equal-interval');
  });

  it('keeps rendering when an unknown panel method value reaches the description', () => {
    const unknownMethod = 'quantiles' as never;
    const { container } = render(DiscretizationPanel, {
      method: unknownMethod,
      breaks: [
        { min: 0, max: 10, count: 1, color: '#111111' },
        { min: 10, max: 20, count: 1, color: '#222222' }
      ]
    });

    expect(container.querySelector('#classification-method')).not.toBeNull();
    expect(container.textContent).toContain(
      'Crée des seuils naturels avec la méthode K-means SQL.'
    );
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

  it('uses only the caller-provided value column for the active channel', () => {
    expect(modalSource).toContain('valueColumn?: string;');
    expect(modalSource).toContain(
      'const activeValueColumn = $derived(valueColumn);'
    );
    expect(modalSource).not.toContain(
      'valueColumn ?? visualization?.mapping.valueColumn'
    );
  });

  it('should use a single opening effect to avoid redundant state syncs', () => {
    expect(modalSource).toContain('const classificationForSync =');
    const openingSyncMatches = modalSource.match(
      /syncStateFromVisualization\(classificationForSync\)/g
    );
    expect(openingSyncMatches).not.toBeNull();
    expect(openingSyncMatches!.length).toBe(1);
  });

  it('uses the same contextual panel background token as palette popovers', () => {
    expect(modalSource).toContain('background: var(--cds-background, #ffffff)');
    expect(modalSource).not.toContain('background: var(--cds-ui-02, #ffffff)');
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

  it('allows typing a breakpoint value incrementally before the full value is valid', async () => {
    const onbreakpointchange = vi.fn();
    const { container } = render(DiscretizationPanel, {
      breakpointValue: null,
      breaks: [
        { min: 14, max: 7600, count: 4, color: '#f7fbff' },
        { min: 7600, max: 30000, count: 8, color: '#c6dbef' },
        { min: 30000, max: 80000, count: 3, color: '#6baed6' },
        { min: 80000, max: 200000, count: 2, color: '#2171b5' },
        { min: 200000, max: 227119, count: 1, color: '#08519c' }
      ],
      onbreakpointchange
    });

    const breakpointInput = container.querySelector(
      '#breakpoint-value'
    ) as HTMLInputElement;

    await fireEvent.input(breakpointInput, {
      target: { value: '2' }
    });

    expect(breakpointInput.value).toBe('2');
    expect(onbreakpointchange).not.toHaveBeenCalledWith(2);

    await fireEvent.input(breakpointInput, {
      target: { value: '200000' }
    });

    expect(breakpointInput.value).toBe('200000');
    expect(onbreakpointchange).toHaveBeenLastCalledWith(200000);
  });

  it('keeps the breakpoint slider enabled when class breaks exist and no break value has been selected yet', () => {
    const { container } = render(DiscretizationPanel, {
      breakpointValue: null,
      breaks: [
        { min: 14, max: 7600, count: 4, color: '#f7fbff' },
        { min: 7600, max: 30000, count: 8, color: '#c6dbef' },
        { min: 30000, max: 80000, count: 3, color: '#6baed6' },
        { min: 80000, max: 200000, count: 2, color: '#2171b5' },
        { min: 200000, max: 227119, count: 1, color: '#08519c' }
      ]
    });

    const breakpointSlider = container.querySelector(
      '.breakpoint-slider-host input'
    ) as HTMLInputElement | null;

    expect(breakpointSlider).not.toBeNull();
    expect(breakpointSlider?.disabled).toBe(false);
  });

  it('can hide breakpoint controls for non-color discretizations', () => {
    render(DiscretizationModal, {
      open: true,
      visualization: createVisualization(),
      showBreakpointControls: false,
      role: 'size'
    });

    expect(document.body.querySelector('.breakpoint-section')).toBeNull();
    expect(document.body.querySelector('#breakpoint-value')).toBeNull();
    expect(
      document.body.querySelector(
        '.discretization-floating-panel[data-role="size"]'
      )
    ).not.toBeNull();
  });

  it('recomputes breakpoint updates through DuckDB breaks', () => {
    const breakpointHandlerBlock = modalSource
      .split('function handleBreakpointChange(value: number | null) {')[1]
      ?.split('function handleBreaksChange')[0];

    expect(breakpointHandlerBlock).toContain('void computeBreaks()');
    expect(modalSource).toContain(
      'function handleBreakpointPositionChange(lowerClassCount: number)'
    );
    expect(modalSource).toContain(
      'bind:breakpointLowerClassCount={currentBreakpointLowerClassCount}'
    );
    expect(modalSource).toContain(
      'function resolveBreakpointFromLowerClassCount'
    );
    expect(modalSource).toContain(
      'currentBreakpoint = resolveBreakpointFromLowerClassCount'
    );
    expect(modalSource).not.toContain('BREAKPOINT_APPLY_DEBOUNCE_MS');
  });
});
