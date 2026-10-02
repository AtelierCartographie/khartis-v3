// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/svelte';
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

  it('shows the rounded scale bounds in the class list', async () => {
    vi.mocked(calculateBreaks).mockResolvedValue({
      breaks: [4000, 16000],
      counts: [30, 4, 1],
      min: 3,
      max: 27367,
      roundedMin: 3,
      roundedMax: 27000
    });

    const visualization = createVisualization({
      classification: {
        method: ClassificationMethod.EQUAL_INTERVAL,
        classes: 3,
        numClasses: 3,
        colors: ['#f7fbff', '#6baed6', '#08519c']
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
        document.body.querySelector<HTMLInputElement>('#break-value-3')?.value
      ).toBe('27000');
    });
    expect(
      document.body.querySelector<HTMLInputElement>('#break-value-0')?.value
    ).toBe('3');
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
});
