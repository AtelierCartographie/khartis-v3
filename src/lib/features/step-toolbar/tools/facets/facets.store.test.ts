import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    visualizations: [],
    createBulkVisualizations: vi.fn(),
    removeBulkVisualizations: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/facet-generator', () => ({
  generateFacetVisualizations: vi.fn().mockResolvedValue([
    { id: 'facet-1', name: 'var1' },
    { id: 'facet-2', name: 'var2' }
  ])
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn()
  },
  LogCategory: { STORE: 'STORE' }
}));

describe('facetsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SCALE_MODE constants', () => {
    it('exports SHARED and INDEPENDENT constants', async () => {
      const { SCALE_MODE } = await import('./facets.store.svelte');
      expect(SCALE_MODE.SHARED).toBe('shared');
      expect(SCALE_MODE.INDEPENDENT).toBe('independent');
    });
  });

  describe('setColumns', () => {
    it('updates the columns layout', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      facetsStore.setColumns(2);
      expect(facetsStore.layout.columns).toBe(2);
    });

    it('accepts values 2, 3, and 4', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      for (const columns of [2, 3, 4] as const) {
        facetsStore.setColumns(columns);
        expect(facetsStore.layout.columns).toBe(columns);
      }
    });
  });

  describe('setGap', () => {
    it('updates the layout gap', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      facetsStore.setGap(8);
      expect(facetsStore.layout.gap).toBe(8);
    });
  });

  describe('setVariables', () => {
    it('updates the variables list', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      facetsStore.setVariables(['var1', 'var2', 'var3']);
      expect(facetsStore.variables).toEqual(['var1', 'var2', 'var3']);
    });

    it('creates a copy to avoid mutation', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      const vars = ['alpha', 'beta'];
      facetsStore.setVariables(vars);
      vars.push('gamma');
      expect(facetsStore.variables).toEqual(['alpha', 'beta']);
    });
  });

  describe('toggleSyncPanZoom', () => {
    it('toggles syncPanZoom to the opposite value', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      const before = facetsStore.syncPanZoom;
      facetsStore.toggleSyncPanZoom();
      expect(facetsStore.syncPanZoom).toBe(!before);
    });

    it('toggles syncPanZoom back to original after two toggles', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      const original = facetsStore.syncPanZoom;
      facetsStore.toggleSyncPanZoom();
      facetsStore.toggleSyncPanZoom();
      expect(facetsStore.syncPanZoom).toBe(original);
    });
  });

  describe('disable', () => {
    it('does nothing when already disabled', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      const { visualizationStore } =
        await import('$lib/features/commons/store/visualization.store.svelte');
      // ensure disabled state
      facetsStore.disable();
      expect(
        visualizationStore.removeBulkVisualizations
      ).not.toHaveBeenCalled();
    });
  });

  describe('enable', () => {
    it('warns when fewer than 2 variables', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      const { logger } = await import('$lib/features/commons/utils/logger');
      await facetsStore.enable('viz-1', ['var1']);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('warns for performance when more than 9 variables', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      const { visualizationStore } =
        await import('$lib/features/commons/store/visualization.store.svelte');
      const { logger } = await import('$lib/features/commons/utils/logger');

      (
        visualizationStore as { visualizations: { id: string; name: string }[] }
      ).visualizations = [{ id: 'viz-1', name: 'Test' }];

      const manyVars = Array.from({ length: 10 }, (_, i) => `var${i}`);
      await facetsStore.enable('viz-1', manyVars);
      expect(logger.warn).toHaveBeenCalledWith(
        'More than 9 facets may impact performance',
        expect.anything()
      );
    });

    it('errors when base visualization is not found', async () => {
      const { facetsStore } = await import('./facets.store.svelte');
      const { visualizationStore } =
        await import('$lib/features/commons/store/visualization.store.svelte');
      const { logger } = await import('$lib/features/commons/utils/logger');

      (visualizationStore as { visualizations: unknown[] }).visualizations = [];
      await facetsStore.enable('non-existent', ['var1', 'var2']);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
