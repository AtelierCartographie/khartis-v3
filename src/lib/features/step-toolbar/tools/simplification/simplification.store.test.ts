import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SimplificationLevel,
  SimplificationSource
} from '$lib/features/commons/types/enums';

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn()
  },
  LogCategory: {
    DUCKDB: 'DUCKDB'
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    selectedDataset: null,
    updateDataset: vi.fn()
  }
}));

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: {
    isActive: false
  }
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    currentBasemap: null,
    loadGeometryIntoDuckDB: vi.fn(async () => 'test_table'),
    simplifyBasemap: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {}
}));

vi.mock('$lib/features/duckdb/operations/simplification', () => ({
  simplifyGeometryTable: vi.fn(async () => ({
    reductionPercentage: 50,
    originalVertices: 1000,
    simplifiedVertices: 500
  })),
  calculateToleranceFromRate: vi.fn(() => 0.01),
  SIMPLIFICATION_TOLERANCE: {
    [SimplificationLevel.Low]: 0.001,
    [SimplificationLevel.Medium]: 0.005,
    [SimplificationLevel.High]: 0.01
  }
}));

describe('simplification.store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has correct default values', async () => {
      const { getSimplificationState } =
        await import('./simplification.store.svelte');
      const state = getSimplificationState();

      expect(state.source).toBe(SimplificationSource.Basemap);
      expect(state.level).toBe(SimplificationLevel.Medium);
      expect(state.rate).toBe(50);
      expect(state.isProcessing).toBe(false);
    });
  });

  describe('setSource', () => {
    it('updates source to Geo', async () => {
      const { simplificationActions, getSimplificationState } =
        await import('./simplification.store.svelte');

      simplificationActions.setSource(SimplificationSource.Geo);

      const state = getSimplificationState();
      expect(state.source).toBe(SimplificationSource.Geo);
    });

    it('restores level from lastApplied when switching to Basemap', async () => {
      const { simplificationActions, getSimplificationState } =
        await import('./simplification.store.svelte');

      simplificationActions.setLevel(SimplificationLevel.High);
      simplificationActions.setSource(SimplificationSource.Geo);
      simplificationActions.setSource(SimplificationSource.Basemap);

      const state = getSimplificationState();
      expect(state.source).toBe(SimplificationSource.Basemap);
    });
  });

  describe('setLevel', () => {
    it('updates level when source is Basemap', async () => {
      const { simplificationActions, getSimplificationState } =
        await import('./simplification.store.svelte');

      simplificationActions.setSource(SimplificationSource.Basemap);
      simplificationActions.setLevel(SimplificationLevel.Low);

      const state = getSimplificationState();
      expect(state.level).toBe(SimplificationLevel.Low);
    });
  });

  describe('setRate', () => {
    it('updates rate when source is Geo', async () => {
      const { simplificationActions, getSimplificationState } =
        await import('./simplification.store.svelte');

      simplificationActions.setSource(SimplificationSource.Geo);
      simplificationActions.setRate(75);

      const state = getSimplificationState();
      expect(state.rate).toBe(75);
    });

    it('clamps rate to 0-100 range', async () => {
      const { simplificationActions, getSimplificationState } =
        await import('./simplification.store.svelte');

      simplificationActions.setSource(SimplificationSource.Geo);
      simplificationActions.setRate(150);

      let state = getSimplificationState();
      expect(state.rate).toBe(100);

      simplificationActions.setRate(-10);

      state = getSimplificationState();
      expect(state.rate).toBe(0);
    });
  });

  describe('applySimplification', () => {
    it('returns null when already processing', async () => {
      const { simplificationActions, getSimplificationState } =
        await import('./simplification.store.svelte');

      const state = getSimplificationState();
      (state as { isProcessing: boolean }).isProcessing = true;

      const result = await simplificationActions.applySimplification();

      expect(result).toBeNull();
    });
  });

  describe('undoLastSimplification', () => {
    it('returns true when there was a lastApplied', async () => {
      const { simplificationActions, getSimplificationState } =
        await import('./simplification.store.svelte');

      const state = getSimplificationState();
      (
        state as {
          lastApplied: { source: SimplificationSource; timestamp: number };
        }
      ).lastApplied = {
        source: SimplificationSource.Basemap,
        timestamp: Date.now()
      };

      const result = simplificationActions.undoLastSimplification();

      expect(result).toBe(true);
    });

    it('returns false when no lastApplied', async () => {
      const { simplificationActions, getSimplificationState } =
        await import('./simplification.store.svelte');

      const state = getSimplificationState();
      state.lastApplied = undefined;

      const result = simplificationActions.undoLastSimplification();

      expect(result).toBe(false);
    });

    it('clears lastApplied', async () => {
      const { simplificationActions, getSimplificationState } =
        await import('./simplification.store.svelte');

      const state = getSimplificationState();
      (
        state as {
          lastApplied: { source: SimplificationSource; timestamp: number };
        }
      ).lastApplied = {
        source: SimplificationSource.Basemap,
        timestamp: Date.now()
      };

      simplificationActions.undoLastSimplification();

      expect(state.lastApplied).toBeUndefined();
    });
  });
});
