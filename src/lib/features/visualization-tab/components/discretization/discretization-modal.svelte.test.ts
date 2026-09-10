import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

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
  datasetsStore: {
    datasets: [{ id: 'dataset-1', sourceFileId: 'source-file-1' }]
  }
}));

import { calculateBreaks } from '$lib/features/commons/services/classification.service';
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
      target: { value: ClassificationMethod.QUANTILES }
    });

    expect(onchange).not.toHaveBeenCalled();
    expect(select?.value).toBe(ClassificationMethod.QUANTILES);
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
      target: { value: ClassificationMethod.QUANTILES }
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
    expect(reopenedSelect?.value).toBe(ClassificationMethod.QUANTILES);
  });

  it('propagates the selected method change from the panel to the parent callback', async () => {
    const onmethodchange = vi.fn();
    const { container } = render(DiscretizationPanel, {
      method: ClassificationMethod.KMEANS,
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
      target: { value: ClassificationMethod.EQUAL_INTERVAL }
    });

    expect(onmethodchange).toHaveBeenCalledWith(
      ClassificationMethod.EQUAL_INTERVAL
    );
    expect(select?.value).toBe(ClassificationMethod.EQUAL_INTERVAL);
  });

  it('keeps rendering when an unknown panel method value reaches the description', () => {
    const unknownMethod = 'quantile' as never;
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
      method: ClassificationMethod.MANUAL,
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

  it('disables the breakpoint position slider until a break value is set', () => {
    const breaks = [
      { min: 14, max: 7600, count: 4, color: '#f7fbff' },
      { min: 7600, max: 30000, count: 8, color: '#c6dbef' },
      { min: 30000, max: 80000, count: 3, color: '#6baed6' },
      { min: 80000, max: 200000, count: 2, color: '#2171b5' },
      { min: 200000, max: 227119, count: 1, color: '#08519c' }
    ];

    const withoutBreakpoint = render(DiscretizationPanel, {
      breakpointValue: null,
      breaks
    });

    expect(
      withoutBreakpoint.container.querySelector<HTMLInputElement>(
        '.breakpoint-slider-host input'
      )?.disabled
    ).toBe(true);

    cleanup();

    const withBreakpoint = render(DiscretizationPanel, {
      breakpointValue: 30000,
      breaks
    });

    expect(
      withBreakpoint.container.querySelector<HTMLInputElement>(
        '.breakpoint-slider-host input'
      )?.disabled
    ).toBe(false);
  });

  it('should show an informative note when tied values merge classes below the requested count', async () => {
    // Zero-inflated column: quantile bounds collapse, 5 requested -> 2 effective.
    vi.mocked(calculateBreaks).mockResolvedValueOnce({
      breaks: [1],
      counts: [8, 2],
      min: 0,
      max: 10
    });

    const visualization = createVisualization();
    render(DiscretizationModal, {
      open: true,
      visualization,
      classification: visualization.classification,
      valueColumn: 'zero_inflated_rate'
    });

    await waitFor(() => {
      expect(
        document.body.querySelector('.class-count-note')?.textContent
      ).toContain(
        'Avec cette méthode, la série ne permet pas plus de 2 classes distinctes'
      );
    });
  });

  it('keeps the Head/Tail class-count ceiling at the natural count when fewer classes are requested', async () => {
    vi.mocked(calculateBreaks).mockResolvedValue({
      breaks: [21, 127, 515],
      counts: [8, 4, 2, 1],
      min: 0,
      max: 30000,
      naturalClassCount: 8
    });

    const visualization = createVisualization({
      classification: {
        method: ClassificationMethod.HEAD_TAIL,
        classes: 4,
        numClasses: 4,
        colors: ['#f7fbff', '#c6dbef', '#6baed6', '#08519c']
      }
    });
    render(DiscretizationModal, {
      open: true,
      visualization,
      classification: visualization.classification,
      valueColumn: 'births'
    });

    await waitFor(() => {
      expect(
        document.body.querySelector<HTMLInputElement>(
          '.compact-number-input input'
        )?.max
      ).toBe('8');
    });
    expect(document.body.querySelector('.class-count-note')).toBeNull();
  });

  it('reports the classes that hold no value', async () => {
    vi.mocked(calculateBreaks).mockResolvedValue({
      breaks: [7000, 13000, 20000, 26000, 33000, 40000],
      counts: [30, 1, 0, 0, 1, 0, 1],
      min: 1,
      max: 46341
    });

    const visualization = createVisualization({
      classification: {
        method: ClassificationMethod.EQUAL_INTERVAL,
        classes: 7,
        numClasses: 7,
        colors: []
      }
    });
    render(DiscretizationModal, {
      open: true,
      visualization,
      classification: visualization.classification,
      valueColumn: 'spending'
    });

    await waitFor(() => {
      expect(
        document.body.querySelector('.class-count-note')?.textContent
      ).toContain('3 classe(s) de cette discrétisation ne contiennent aucune');
    });
  });

  it('refuses to switch to Q6 when the series cannot hold its six classes', async () => {
    vi.mocked(calculateBreaks).mockResolvedValue({
      breaks: [2, 4, 10, 61],
      counts: [8000, 5000, 9000, 8000, 4953],
      min: 0,
      max: 27367
    });

    const visualization = createVisualization({
      classification: {
        method: ClassificationMethod.KMEANS,
        classes: 5,
        numClasses: 5,
        colors: []
      }
    });
    render(DiscretizationModal, {
      open: true,
      visualization,
      classification: visualization.classification,
      valueColumn: 'births'
    });

    const select = await waitFor(() => {
      const node = document.body.querySelector(
        '#classification-method'
      ) as HTMLSelectElement | null;
      expect(node).not.toBeNull();
      return node as HTMLSelectElement;
    });

    await fireEvent.change(select, { target: { value: 'q6' } });

    await waitFor(() => {
      expect(
        document.body.querySelector('.class-count-note')?.textContent
      ).toContain("Q6 impose 6 classes, or cette série n'en permet que 5");
    });
    await waitFor(() => {
      expect(
        (
          document.body.querySelector(
            '#classification-method'
          ) as HTMLSelectElement
        ).value
      ).toBe('kmeans');
    });
  });

  it('explains a degenerate Head/Tail ladder instead of blaming merged bounds', async () => {
    vi.mocked(calculateBreaks).mockResolvedValue({
      breaks: [52],
      counts: [19, 15],
      min: 1,
      max: 94,
      naturalClassCount: 2
    });

    const visualization = createVisualization({
      classification: {
        method: ClassificationMethod.HEAD_TAIL,
        classes: 5,
        numClasses: 5,
        colors: ['#f7fbff', '#08519c']
      }
    });
    render(DiscretizationModal, {
      open: true,
      visualization,
      classification: visualization.classification,
      valueColumn: 'region_code'
    });

    await waitFor(() => {
      expect(
        document.body.querySelector('.class-count-note')?.textContent
      ).toContain('Head/Tail ne dégage que 2 classes');
    });
  });

  it('should not show the merged-classes note when the computed classes match the request', async () => {
    vi.mocked(calculateBreaks).mockResolvedValueOnce({
      breaks: [2, 4, 6, 8],
      counts: [2, 2, 2, 2, 2],
      min: 0,
      max: 10
    });

    const visualization = createVisualization();
    render(DiscretizationModal, {
      open: true,
      visualization,
      classification: visualization.classification,
      valueColumn: 'well_distributed_rate'
    });

    await waitFor(() => {
      expect(document.body.querySelector('#break-value-1')).not.toBeNull();
    });
    expect(document.body.querySelector('.class-count-note')).toBeNull();
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
});
