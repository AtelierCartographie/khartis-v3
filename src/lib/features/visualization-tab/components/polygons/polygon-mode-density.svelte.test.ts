import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PolygonModeDensity from './polygon-mode-density.svelte';
import { DENSITY_LEVEL } from '$lib/features/commons/constants/visualization.constants';
import type { DensityLevelOption } from '$lib/features/commons/constants/visualization.constants';
import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';

const mocks = vi.hoisted(() => ({
  datasets: [
    {
      id: 'dataset-1',
      tableName: 'source_table',
      sourceFileId: 'source-1'
    }
  ],
  getDatasetByIdMock: vi.fn(),
  getDatasetBySourceFileMock: vi.fn(),
  computeDensityLevelsMock: vi.fn(),
  computeDensityLevelsFromJoinMock: vi.fn(),
  computeDensityLevelsFromGpsJoinMock: vi.fn()
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    get datasets() {
      return mocks.datasets;
    }
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetById: mocks.getDatasetByIdMock,
    getDatasetBySourceFile: mocks.getDatasetBySourceFileMock,
    computeDensityLevels: mocks.computeDensityLevelsMock,
    computeDensityLevelsFromJoin: mocks.computeDensityLevelsFromJoinMock,
    computeDensityLevelsFromGpsJoin: mocks.computeDensityLevelsFromGpsJoinMock
  }
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function createVisualization(valueColumn: string): VisualizationConfig {
  return {
    id: 'viz-1',
    name: 'Density',
    type: 'choropleth',
    datasetId: 'dataset-1',
    mapping: {},
    style: { fillOpacity: 1 },
    density: { valueColumn }
  } as VisualizationConfig;
}

function densityOption(ratio: number): DensityLevelOption {
  return {
    level: DENSITY_LEVEL.STANDARD,
    ratio
  };
}

describe('PolygonModeDensity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDatasetByIdMock.mockReturnValue({ tableName: 'source_table' });
  });

  it('ignores stale density-level responses after the value column changes', async () => {
    const firstRequest = deferred<DensityLevelOption[]>();
    const secondRequest = deferred<DensityLevelOption[]>();
    const onDensityChange = vi.fn();

    mocks.computeDensityLevelsMock.mockImplementation(
      (_tableName: string, column: string) =>
        column === 'population' ? firstRequest.promise : secondRequest.promise
    );

    const { rerender } = render(PolygonModeDensity, {
      dataFields: [
        { id: 1, text: 'population', type: 'number' },
        { id: 2, text: 'income', type: 'number' }
      ],
      visualization: createVisualization('population'),
      onDensityChange
    });

    await waitFor(() => {
      expect(mocks.computeDensityLevelsMock).toHaveBeenCalledWith(
        'source_table',
        'population',
        100_000
      );
    });

    await rerender({
      dataFields: [
        { id: 1, text: 'population', type: 'number' },
        { id: 2, text: 'income', type: 'number' }
      ],
      visualization: createVisualization('income'),
      onDensityChange
    });

    await waitFor(() => {
      expect(mocks.computeDensityLevelsMock).toHaveBeenCalledWith(
        'source_table',
        'income',
        100_000
      );
    });

    secondRequest.resolve([densityOption(20)]);
    await waitFor(() => {
      expect(onDensityChange).toHaveBeenCalledWith({
        valueColumn: 'income',
        level: DENSITY_LEVEL.STANDARD,
        ratio: 20
      });
    });

    firstRequest.resolve([densityOption(10)]);
    await tick();

    expect(onDensityChange).not.toHaveBeenCalledWith({
      valueColumn: 'population',
      level: DENSITY_LEVEL.STANDARD,
      ratio: 10
    });
  });
});
