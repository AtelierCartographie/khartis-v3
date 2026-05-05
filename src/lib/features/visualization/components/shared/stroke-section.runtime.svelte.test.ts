import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_COLORS,
  StrokeMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  ClassificationMethod,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import StrokeSection from './stroke-section.svelte';

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    datasets: [],
    selectedDataset: undefined
  }
}));

vi.mock('../../facets-adapter', () => ({
  FACET_SLOT: {},
  facetsStore: {
    enabled: false,
    baseVisualizationId: undefined,
    primarySlotPath: null,
    variables: [],
    disable: vi.fn(),
    updateVariables: vi.fn()
  }
}));

function buildVisualization(
  strokeMode: StrokeMode = StrokeMode.CLASSES
): VisualizationConfig {
  return {
    id: 'viz-stroke',
    name: 'Stroke visualization',
    type: 'proportional',
    datasetId: 'dataset-1',
    enabled: true,
    style: {
      strokeWidth: 1,
      strokeOpacity: 1
    },
    mapping: {},
    modes: {
      stroke: strokeMode
    },
    missingData: {
      show: true,
      shape: 'circle',
      size: 2,
      color: DEFAULT_COLORS.missingData
    }
  } as VisualizationConfig;
}

describe('StrokeSection runtime', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows missing-data controls for stroke classes when missing data is enabled', () => {
    const { container } = render(StrokeSection, {
      visualization: buildVisualization(),
      dataFields: [{ id: 1, text: 'metric', type: 'number' }],
      strokeValueColumn: 'metric',
      strokeClassification: {
        method: ClassificationMethod.QUANTILES,
        classes: 4,
        numClasses: 4,
        colors: ['#f7fbff', '#6baed6', '#2171b5', '#08306b'],
        labels: []
      },
      onStrokeClassificationChange: vi.fn(),
      onMissingDataShowChange: vi.fn(),
      onMissingDataColorChange: vi.fn()
    });

    const missingDataSection = container.querySelector('.missing-data-section');

    expect(missingDataSection).toBeInstanceOf(HTMLElement);
    if (!(missingDataSection instanceof HTMLElement)) {
      return;
    }

    expect(
      within(missingDataSection).getByText("Afficher l'absence de données")
    ).toBeInTheDocument();
    expect(
      within(missingDataSection).getByRole('button', { name: 'Couleur' })
    ).toBeInTheDocument();
    expect(
      within(missingDataSection).queryByText('Représentation')
    ).not.toBeInTheDocument();
    expect(
      within(missingDataSection).queryByText('Taille')
    ).not.toBeInTheDocument();
  });

  it('does not render missing-data controls when the section opts out', () => {
    render(StrokeSection, {
      visualization: buildVisualization(),
      dataFields: [{ id: 1, text: 'metric', type: 'number' }],
      strokeValueColumn: 'metric',
      showMissingDataSection: false,
      onStrokeClassificationChange: vi.fn()
    });

    expect(
      screen.queryByText("Afficher l'absence de données")
    ).not.toBeInTheDocument();
  });
});
