import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notifyChangeMock: vi.fn(),
  visualizations: [] as Array<Record<string, unknown>>,
  datasets: [] as Array<Record<string, unknown>>,
  createBulkVisualizationsMock: vi.fn(),
  removeBulkVisualizationsMock: vi.fn(),
  setVisualizationOrderMock: vi.fn(),
  generateFacetVisualizationsMock: vi.fn(),
  buildFacetVisualizationUpdatesMock: vi.fn()
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: {
    register: vi.fn(),
    notifyChange: mocks.notifyChangeMock
  }
}));

vi.mock('$lib/features/commons/utils/facet-generator', () => ({
  generateFacetVisualizations: mocks.generateFacetVisualizationsMock,
  buildFacetVisualizationUpdates: mocks.buildFacetVisualizationUpdatesMock
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get datasets() {
      return mocks.datasets;
    }
  }
}));

const updateVisualizationMock = vi.hoisted(() => vi.fn());

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    get visualizations() {
      return mocks.visualizations;
    },
    createBulkVisualizations: mocks.createBulkVisualizationsMock,
    removeBulkVisualizations: mocks.removeBulkVisualizationsMock,
    setVisualizationOrder: mocks.setVisualizationOrderMock,
    updateVisualization: updateVisualizationMock
  }
}));

import {
  FACET_SLOT,
  facetsStore,
  MAX_FACETS,
  SCALE_MODE
} from './facets.store.svelte';

describe('facetsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildFacetVisualizationUpdatesMock.mockImplementation(
      ({
        variable,
        baseViz
      }: {
        variable: string;
        baseViz: { id: string };
      }) => ({
        name: variable,
        facet: {
          baseVisualizationId: baseViz.id
        }
      })
    );

    mocks.visualizations = [
      {
        id: 'base-viz',
        name: 'Base visualization'
      }
    ];
    mocks.datasets = [];

    facetsStore.restoreFromSerialized(undefined);
  });

  it('reorders variables without regenerating facet visualizations', async () => {
    mocks.visualizations = [
      {
        id: 'base-viz',
        name: 'Base visualization'
      },
      { id: 'facet-a', name: 'a' },
      { id: 'facet-b', name: 'b' },
      { id: 'facet-c', name: 'c' }
    ];

    facetsStore.restoreFromSerialized({
      enabled: true,
      baseVisualizationId: 'base-viz',
      primarySlotPath: FACET_SLOT.POLYGON_VALUE,
      variables: ['a', 'b', 'c'],
      layout: { columns: 3, gap: 16 },
      scaleMode: SCALE_MODE.SHARED,
      syncPanZoom: false,
      generatedVisualizationIds: ['facet-a', 'facet-b', 'facet-c']
    });

    await facetsStore.reorderVariables(0, 2);

    expect(facetsStore.variables).toEqual(['b', 'c', 'a']);
    expect(mocks.generateFacetVisualizationsMock).not.toHaveBeenCalled();
    expect(mocks.removeBulkVisualizationsMock).not.toHaveBeenCalled();
    expect(mocks.createBulkVisualizationsMock).not.toHaveBeenCalled();
    expect(mocks.setVisualizationOrderMock).toHaveBeenCalledWith([
      'base-viz',
      'facet-b',
      'facet-c',
      'facet-a'
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
        primarySlotPath: FACET_SLOT.POLYGON_VALUE,
        variables: ['a', 'b', 'c'],
        layout: { columns: 3, gap: 16 },
        scaleMode: SCALE_MODE.SHARED,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a', 'facet-b', 'facet-c']
      });

      await facetsStore.updateVariables(
        'base-viz',
        ['a'],
        FACET_SLOT.POLYGON_VALUE
      );

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

      await facetsStore.updateVariables(
        'base-viz',
        ['a', 'b'],
        FACET_SLOT.POLYGON_VALUE
      );

      expect(facetsStore.enabled).toBe(true);
      expect(facetsStore.baseVisualizationId).toBe('base-viz');
      expect(facetsStore.variables).toEqual(['a', 'b']);
      expect(mocks.generateFacetVisualizationsMock).toHaveBeenCalledWith(
        mocks.visualizations[0],
        ['a', 'b'],
        SCALE_MODE.INDEPENDENT,
        FACET_SLOT.POLYGON_VALUE
      );
    });

    it('filters incompatible text fields out of numeric facet slots before generation', async () => {
      mocks.visualizations = [
        {
          id: 'base-viz',
          name: 'Base visualization',
          datasetId: 'dataset-1'
        }
      ];
      mocks.datasets = [
        {
          id: 'dataset-1',
          columns: [
            { name: 'label', type: 'text' },
            { name: 'a', type: 'number' },
            { name: 'b', type: 'number' }
          ]
        }
      ];
      mocks.generateFacetVisualizationsMock.mockResolvedValue([
        { id: 'facet-a' },
        { id: 'facet-b' }
      ]);

      await facetsStore.updateVariables(
        'base-viz',
        ['label', 'a', 'b'],
        FACET_SLOT.POLYGON_VALUE
      );

      expect(facetsStore.variables).toEqual(['a', 'b']);
      expect(mocks.generateFacetVisualizationsMock).toHaveBeenCalledWith(
        mocks.visualizations[0],
        ['a', 'b'],
        SCALE_MODE.INDEPENDENT,
        FACET_SLOT.POLYGON_VALUE
      );
    });

    it('fills the activation seed with another compatible numeric variable when the initial toggle includes text fields', async () => {
      mocks.visualizations = [
        {
          id: 'base-viz',
          name: 'Base visualization',
          datasetId: 'dataset-1'
        }
      ];
      mocks.datasets = [
        {
          id: 'dataset-1',
          columns: [
            { name: 'label', type: 'text' },
            { name: 'a', type: 'number' },
            { name: 'b', type: 'number' }
          ]
        }
      ];
      mocks.generateFacetVisualizationsMock.mockResolvedValue([
        { id: 'facet-a' },
        { id: 'facet-b' }
      ]);

      await facetsStore.updateVariables(
        'base-viz',
        ['label', 'a'],
        FACET_SLOT.POLYGON_VALUE
      );

      expect(facetsStore.enabled).toBe(true);
      expect(facetsStore.variables).toEqual(['a', 'b']);
      expect(mocks.generateFacetVisualizationsMock).toHaveBeenCalledWith(
        mocks.visualizations[0],
        ['a', 'b'],
        SCALE_MODE.INDEPENDENT,
        FACET_SLOT.POLYGON_VALUE
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
        primarySlotPath: FACET_SLOT.POLYGON_VALUE,
        variables: ['a', 'b'],
        layout: { columns: 2, gap: 16 },
        scaleMode: SCALE_MODE.SHARED,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a', 'facet-b']
      });

      await facetsStore.updateVariables(
        'base-viz',
        ['a', 'b', 'd'],
        FACET_SLOT.POLYGON_VALUE
      );

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

    it('should skip regeneration when the requested collection already matches the current one', async () => {
      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        primarySlotPath: FACET_SLOT.POLYGON_VALUE,
        variables: ['a', 'b'],
        layout: { columns: 2, gap: 16 },
        scaleMode: SCALE_MODE.SHARED,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a', 'facet-b']
      });

      await facetsStore.updateVariables(
        'base-viz',
        ['a', 'b'],
        FACET_SLOT.POLYGON_VALUE
      );

      expect(mocks.generateFacetVisualizationsMock).not.toHaveBeenCalled();
      expect(mocks.removeBulkVisualizationsMock).not.toHaveBeenCalled();
      expect(mocks.createBulkVisualizationsMock).not.toHaveBeenCalled();
    });
  });

  describe('setVariableForSlot', () => {
    it('should return false when the collection is not enabled', () => {
      const result = facetsStore.setVariableForSlot(
        0,
        FACET_SLOT.SYMBOL_SIZE,
        'x'
      );
      expect(result).toBe(false);
      expect(updateVisualizationMock).not.toHaveBeenCalled();
    });

    it('should update the facette at the given index for the given slot', () => {
      mocks.visualizations = [
        {
          id: 'base-viz',
          name: 'Base',
          datasetId: 'dataset-1'
        },
        {
          id: 'facet-a',
          name: 'a',
          mapping: { sizeColumn: 'a' },
          symbol: { sizeColumn: 'a' }
        },
        {
          id: 'facet-b',
          name: 'b',
          mapping: { sizeColumn: 'b' },
          symbol: { sizeColumn: 'b' }
        }
      ];
      mocks.datasets = [
        {
          id: 'dataset-1',
          columns: [
            { name: 'new-var', type: 'number' },
            { name: 'label', type: 'text' }
          ]
        }
      ];
      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        primarySlotPath: FACET_SLOT.SYMBOL_SIZE,
        variables: ['a', 'b'],
        layout: { columns: 2, gap: 16 },
        scaleMode: SCALE_MODE.INDEPENDENT,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a', 'facet-b']
      });

      const result = facetsStore.setVariableForSlot(
        1,
        FACET_SLOT.SYMBOL_SIZE,
        'new-var'
      );

      expect(result).toBe(true);
      expect(updateVisualizationMock).toHaveBeenCalledWith('facet-b', {
        mapping: { sizeColumn: 'new-var' },
        symbol: { sizeColumn: 'new-var' }
      });
    });

    it('rejects incompatible text fields for numeric facet slots', () => {
      mocks.visualizations = [
        {
          id: 'base-viz',
          name: 'Base',
          datasetId: 'dataset-1'
        },
        {
          id: 'facet-a',
          name: 'a',
          mapping: { sizeColumn: 'a' },
          symbol: { sizeColumn: 'a' }
        }
      ];
      mocks.datasets = [
        {
          id: 'dataset-1',
          columns: [{ name: 'label', type: 'text' }]
        }
      ];

      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        primarySlotPath: FACET_SLOT.SYMBOL_SIZE,
        variables: ['a'],
        layout: { columns: 1, gap: 16 },
        scaleMode: SCALE_MODE.INDEPENDENT,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a']
      });

      const result = facetsStore.setVariableForSlot(
        0,
        FACET_SLOT.SYMBOL_SIZE,
        'label'
      );

      expect(result).toBe(false);
      expect(updateVisualizationMock).not.toHaveBeenCalled();
    });

    it('should return false when the map index points to no facette', () => {
      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        primarySlotPath: FACET_SLOT.SYMBOL_SIZE,
        variables: ['a'],
        layout: { columns: 1, gap: 16 },
        scaleMode: SCALE_MODE.INDEPENDENT,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a']
      });

      const result = facetsStore.setVariableForSlot(
        5,
        FACET_SLOT.SYMBOL_SIZE,
        'x'
      );

      expect(result).toBe(false);
      expect(updateVisualizationMock).not.toHaveBeenCalled();
    });
  });

  describe('toggleScaleMode', () => {
    it('should toggle from independent to shared without regenerating facets when generated visualizations are present', async () => {
      mocks.visualizations = [
        {
          id: 'base-viz',
          name: 'Base'
        },
        {
          id: 'facet-a',
          name: 'a',
          mapping: { valueColumn: 'a' },
          polygon: {
            valueColumn: 'a',
            classification: { breaks: [0, 5, 10] }
          },
          classification: { breaks: [0, 5, 10] }
        },
        {
          id: 'facet-b',
          name: 'b',
          mapping: { valueColumn: 'b' },
          polygon: {
            valueColumn: 'b',
            classification: { breaks: [0, 5, 10] }
          },
          classification: { breaks: [0, 5, 10] }
        }
      ];
      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        primarySlotPath: FACET_SLOT.POLYGON_VALUE,
        variables: ['a', 'b'],
        layout: { columns: 2, gap: 16 },
        scaleMode: SCALE_MODE.INDEPENDENT,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a', 'facet-b']
      });

      await facetsStore.toggleScaleMode();

      expect(facetsStore.scaleMode).toBe(SCALE_MODE.SHARED);
      expect(mocks.generateFacetVisualizationsMock).not.toHaveBeenCalled();
      expect(mocks.removeBulkVisualizationsMock).not.toHaveBeenCalled();
      expect(mocks.createBulkVisualizationsMock).not.toHaveBeenCalled();
      expect(updateVisualizationMock).toHaveBeenCalledTimes(2);
      expect(updateVisualizationMock).toHaveBeenNthCalledWith(
        1,
        'facet-a',
        expect.objectContaining({
          name: 'a',
          facet: { baseVisualizationId: 'base-viz' }
        })
      );
    });

    it('should toggle from shared to independent', async () => {
      mocks.generateFacetVisualizationsMock.mockResolvedValue([
        { id: 'new-a' }
      ]);

      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'base-viz',
        primarySlotPath: FACET_SLOT.POLYGON_VALUE,
        variables: ['a'],
        layout: { columns: 1, gap: 16 },
        scaleMode: SCALE_MODE.SHARED,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a']
      });

      await facetsStore.toggleScaleMode();

      expect(facetsStore.scaleMode).toBe(SCALE_MODE.INDEPENDENT);
    });
  });

  describe('toggleSyncPanZoom', () => {
    it('should toggle syncPanZoom state', () => {
      expect(facetsStore.syncPanZoom).toBe(true);

      facetsStore.toggleSyncPanZoom();
      expect(facetsStore.syncPanZoom).toBe(false);

      facetsStore.toggleSyncPanZoom();
      expect(facetsStore.syncPanZoom).toBe(true);
    });

    it('should notify persistence on toggle', () => {
      facetsStore.toggleSyncPanZoom();
      expect(mocks.notifyChangeMock).toHaveBeenCalledWith('facets');
    });
  });

  describe('setColumns', () => {
    it('should update layout columns', () => {
      facetsStore.setColumns(4);
      expect(facetsStore.layout.columns).toBe(4);
    });

    it('should notify persistence', () => {
      facetsStore.setColumns(2);
      expect(mocks.notifyChangeMock).toHaveBeenCalledWith('facets');
    });
  });

  describe('setGap', () => {
    it('should update layout gap', () => {
      facetsStore.setGap(24);
      expect(facetsStore.layout.gap).toBe(24);
    });

    it('should notify persistence', () => {
      facetsStore.setGap(8);
      expect(mocks.notifyChangeMock).toHaveBeenCalledWith('facets');
    });
  });

  describe('restoreFromSerialized', () => {
    it('should fall back to defaults when given null', () => {
      facetsStore.restoreFromSerialized(null);

      expect(facetsStore.enabled).toBe(false);
      expect(facetsStore.variables).toEqual([]);
      expect(facetsStore.layout.columns).toBe(3);
      expect(facetsStore.scaleMode).toBe(SCALE_MODE.INDEPENDENT);
      expect(facetsStore.syncPanZoom).toBe(true);
    });

    it('should fall back to defaults when given a non-object', () => {
      facetsStore.restoreFromSerialized('garbage');

      expect(facetsStore.enabled).toBe(false);
      expect(facetsStore.variables).toEqual([]);
      expect(facetsStore.syncPanZoom).toBe(true);
    });

    it('should clamp columns to valid range', () => {
      facetsStore.restoreFromSerialized({
        layout: { columns: -5, gap: 16 }
      });

      expect(facetsStore.layout.columns).toBe(1);
    });

    it('should clamp columns to max', () => {
      facetsStore.restoreFromSerialized({
        layout: { columns: 999, gap: 16 }
      });

      expect(facetsStore.layout.columns).toBe(4);
    });

    it('should reject invalid scaleMode and use default', () => {
      facetsStore.restoreFromSerialized({
        scaleMode: 'bogus'
      });

      expect(facetsStore.scaleMode).toBe(SCALE_MODE.INDEPENDENT);
    });

    it('should filter out non-string entries from variables array', () => {
      facetsStore.restoreFromSerialized({
        variables: ['a', 42, null, 'b', undefined]
      });

      expect(facetsStore.variables).toEqual(['a', 'b']);
    });

    it('should default gap to 16 if negative', () => {
      facetsStore.restoreFromSerialized({
        layout: { columns: 3, gap: -10 }
      });

      expect(facetsStore.layout.gap).toBe(16);
    });
  });

  describe('enable', () => {
    it('should cap variables at MAX_FACETS', async () => {
      const manyVars = Array.from(
        { length: MAX_FACETS + 5 },
        (_, i) => `var-${i}`
      );
      const expectedCapped = manyVars.slice(0, MAX_FACETS);
      const mockConfigs = expectedCapped.map((v) => ({ id: `facet-${v}` }));
      mocks.generateFacetVisualizationsMock.mockResolvedValue(mockConfigs);

      await facetsStore.enable('base-viz', manyVars);

      expect(facetsStore.variables).toHaveLength(MAX_FACETS);
      expect(mocks.generateFacetVisualizationsMock).toHaveBeenCalledWith(
        mocks.visualizations[0],
        expectedCapped,
        SCALE_MODE.INDEPENDENT,
        FACET_SLOT.POLYGON_VALUE
      );
    });
  });

  describe('facetVisualizations', () => {
    it('should auto-disable when base visualization is deleted', () => {
      facetsStore.restoreFromSerialized({
        enabled: true,
        baseVisualizationId: 'deleted-viz',
        primarySlotPath: FACET_SLOT.POLYGON_VALUE,
        variables: ['a', 'b'],
        layout: { columns: 2, gap: 16 },
        scaleMode: SCALE_MODE.SHARED,
        syncPanZoom: false,
        generatedVisualizationIds: ['facet-a', 'facet-b']
      });

      mocks.visualizations = [];

      const result = facetsStore.facetVisualizations;

      expect(result).toEqual([]);
      expect(facetsStore.enabled).toBe(false);
    });
  });
});
