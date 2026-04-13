import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notifyChangeMock: vi.fn(),
  visualizations: [] as Array<Record<string, unknown>>,
  createBulkVisualizationsMock: vi.fn(),
  removeBulkVisualizationsMock: vi.fn(),
  generateFacetVisualizationsMock: vi.fn()
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/features/commons/utils/facet-generator', () => ({
  generateFacetVisualizations: mocks.generateFacetVisualizationsMock
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    get visualizations() {
      return mocks.visualizations;
    },
    createBulkVisualizations: mocks.createBulkVisualizationsMock,
    removeBulkVisualizations: mocks.removeBulkVisualizationsMock
  }
}));

import { facetsStore, SCALE_MODE } from './facets.store.svelte';

describe('facetsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.visualizations = [
      {
        id: 'base-viz',
        name: 'Base visualization'
      }
    ];

    facetsStore.restoreFromSerialized(undefined);
  });

  it('reorders variables and regenerates facet visualizations in the new order', async () => {
    mocks.generateFacetVisualizationsMock.mockResolvedValue([
      { id: 'facet-b' },
      { id: 'facet-c' },
      { id: 'facet-a' }
    ]);

    facetsStore.restoreFromSerialized({
      enabled: true,
      baseVisualizationId: 'base-viz',
      variables: ['a', 'b', 'c'],
      layout: { columns: 3, gap: 16 },
      scaleMode: SCALE_MODE.SHARED,
      syncPanZoom: false,
      generatedVisualizationIds: ['facet-a', 'facet-b', 'facet-c']
    });

    await facetsStore.reorderVariables(0, 2);

    expect(facetsStore.variables).toEqual(['b', 'c', 'a']);
    expect(mocks.generateFacetVisualizationsMock).toHaveBeenCalledWith(
      mocks.visualizations[0],
      ['b', 'c', 'a'],
      SCALE_MODE.SHARED
    );
    expect(mocks.removeBulkVisualizationsMock).toHaveBeenCalledWith([
      'facet-a',
      'facet-b',
      'facet-c'
    ]);
    expect(mocks.createBulkVisualizationsMock).toHaveBeenCalledWith([
      { id: 'facet-b' },
      { id: 'facet-c' },
      { id: 'facet-a' }
    ]);
    expect(facetsStore.generatedVisualizationIds).toEqual([
      'facet-b',
      'facet-c',
      'facet-a'
    ]);
  });
});
