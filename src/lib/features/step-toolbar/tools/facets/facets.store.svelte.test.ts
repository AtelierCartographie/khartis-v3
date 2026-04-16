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

const updateVisualizationMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    get visualizations() {
      return mocks.visualizations;
    },
    createBulkVisualizations: mocks.createBulkVisualizationsMock,
    removeBulkVisualizations: mocks.removeBulkVisualizationsMock,
    updateVisualization: updateVisualizationMock
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

  describe('updateVariables', () => {
    it('should disable the collection when fewer than 2 variables are provided', async () => {
      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        variables: ['a', 'b', 'c'],
        layout: { columns: 3, gap: 16 },
        scaleMode: SCALE_MODE.SHARED,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a', 'facet-b', 'facet-c']
      });

      await facetsStore.updateVariables('base-viz', ['a']);

      expect(facetsStore.enabled).toBe(false);
      expect(mocks.removeBulkVisualizationsMock).toHaveBeenCalledWith([
        'facet-a',
        'facet-b',
        'facet-c'
      ]);
    });

    it('should enable a new collection when not yet enabled', async () => {
      mocks.generateFacetVisualizationsMock.mockResolvedValue([
        { id: 'facet-a' },
        { id: 'facet-b' }
      ]);

      await facetsStore.updateVariables('base-viz', ['a', 'b']);

      expect(facetsStore.enabled).toBe(true);
      expect(facetsStore.baseVisualizationId).toBe('base-viz');
      expect(facetsStore.variables).toEqual(['a', 'b']);
      expect(mocks.generateFacetVisualizationsMock).toHaveBeenCalledWith(
        mocks.visualizations[0],
        ['a', 'b'],
        SCALE_MODE.INDEPENDENT
      );
    });

    it('should regenerate facets when the collection is already enabled', async () => {
      mocks.generateFacetVisualizationsMock.mockResolvedValue([
        { id: 'facet-a' },
        { id: 'facet-b' },
        { id: 'facet-d' }
      ]);

      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        variables: ['a', 'b'],
        layout: { columns: 2, gap: 16 },
        scaleMode: SCALE_MODE.SHARED,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a', 'facet-b']
      });

      await facetsStore.updateVariables('base-viz', ['a', 'b', 'd']);

      expect(facetsStore.variables).toEqual(['a', 'b', 'd']);
      expect(mocks.removeBulkVisualizationsMock).toHaveBeenCalledWith([
        'facet-a',
        'facet-b'
      ]);
      expect(mocks.createBulkVisualizationsMock).toHaveBeenCalledWith([
        { id: 'facet-a' },
        { id: 'facet-b' },
        { id: 'facet-d' }
      ]);
      expect(facetsStore.generatedVisualizationIds).toEqual([
        'facet-a',
        'facet-b',
        'facet-d'
      ]);
    });
  });

  describe('setVariableForSlot', () => {
    it('should return false when the collection is not enabled', () => {
      const result = facetsStore.setVariableForSlot(0, 'sizeColumn', 'x');
      expect(result).toBe(false);
      expect(updateVisualizationMock).not.toHaveBeenCalled();
    });

    it('should update the facette at the given index for the given slot', () => {
      mocks.visualizations = [
        {
          id: 'base-viz',
          name: 'Base'
        },
        {
          id: 'facet-a',
          name: 'a',
          mapping: { sizeColumn: 'a' }
        },
        {
          id: 'facet-b',
          name: 'b',
          mapping: { sizeColumn: 'b' }
        }
      ];
      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        variables: ['a', 'b'],
        layout: { columns: 2, gap: 16 },
        scaleMode: SCALE_MODE.INDEPENDENT,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a', 'facet-b']
      });

      const result = facetsStore.setVariableForSlot(1, 'sizeColumn', 'new-var');

      expect(result).toBe(true);
      expect(updateVisualizationMock).toHaveBeenCalledWith('facet-b', {
        mapping: { sizeColumn: 'new-var' }
      });
    });

    it('should return false when the map index points to no facette', () => {
      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        variables: ['a'],
        layout: { columns: 1, gap: 16 },
        scaleMode: SCALE_MODE.INDEPENDENT,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a']
      });

      const result = facetsStore.setVariableForSlot(5, 'sizeColumn', 'x');

      expect(result).toBe(false);
      expect(updateVisualizationMock).not.toHaveBeenCalled();
    });
  });
});
