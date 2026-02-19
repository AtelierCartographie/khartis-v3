import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ViewMode } from '$lib/features/commons/constants/ui.constants';

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => {
  const mockGetDatasetsByType = vi.fn(() => []);
  return {
    datasetsStore: {
      get datasets() {
        return [];
      },
      getDatasetsByType: mockGetDatasetsByType
    }
  };
});

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalActions: {
    setProjectionViewMode: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/projection.utils', () => ({
  fitProjectionToGeoJSON: vi.fn(() => ({
    scale: () => 100,
    translate: () => [0, 0]
  })),
  getProjectionById: vi.fn((id) => ({
    id,
    name: `Projection ${id}`,
    category: 'rectangular'
  })),
  projectGeoJSON: vi.fn(() => ({
    type: 'FeatureCollection',
    features: []
  })),
  suggestProjection: vi.fn(() => 'mercator')
}));

vi.mock('$lib/features/commons/store/map-instance.store.svelte', () => ({
  mapInstanceStore: {
    map: {
      setCenter: vi.fn(),
      setBearing: vi.fn()
    }
  }
}));

vi.mock('$lib/features/map/stores/map-projection.store.svelte', () => ({
  mapProjectionStore: {
    setProjection: vi.fn()
  }
}));

vi.mock('$lib/features/commons/constants', () => ({
  GEOJSON_TYPE: {
    FEATURE: 'Feature',
    FEATURE_COLLECTION: 'FeatureCollection'
  }
}));

describe('projection.store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has correct default values', async () => {
      const { getProjectionState } = await import('./projection.store.svelte');
      const state = getProjectionState();

      expect(state.selected).toBe('mercator');
      expect(state.viewMode).toBe(ViewMode.LIST);
      expect(state.longitude).toBe(0);
      expect(state.latitude).toBe(0);
      expect(state.rotation).toBe(0);
      expect(state.scale).toBe(1);
      expect(state.autoFit).toBe(true);
    });
  });

  describe('setSelected', () => {
    it('updates selected projection', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setSelected('equirectangular');

      const state = getProjectionState();
      expect(state.selected).toBe('equirectangular');
    });

    it('clears custom code when selecting standard projection', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setCustomCode('custom projection code');
      projectionActions.setSelected('mercator');

      const state = getProjectionState();
      expect(state.customCode).toBeUndefined();
    });

    it('calls mapProjectionStore.setProjection', async () => {
      const { projectionActions } = await import('./projection.store.svelte');
      const { mapProjectionStore } =
        await import('$lib/features/map/stores/map-projection.store.svelte');

      projectionActions.setSelected('mercator');

      expect(mapProjectionStore.setProjection).toHaveBeenCalled();
    });
  });

  describe('setCustomCode', () => {
    it('sets custom projection code', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setCustomCode('+proj=ortho +lat_0=0 +lon_0=0');

      const state = getProjectionState();
      expect(state.customCode).toBe('+proj=ortho +lat_0=0 +lon_0=0');
    });

    it('clears custom code when empty', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setCustomCode('some code');
      projectionActions.setCustomCode('');

      const state = getProjectionState();
      expect(state.customCode).toBeUndefined();
    });

    it('clears custom code when whitespace only', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setCustomCode('   ');
      const state = getProjectionState();
      expect(state.customCode).toBeUndefined();
    });
  });

  describe('setViewMode', () => {
    it('updates view mode', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setViewMode(ViewMode.GRID);

      const state = getProjectionState();
      expect(state.viewMode).toBe(ViewMode.GRID);
    });

    it('calls globalActions.setProjectionViewMode', async () => {
      const { projectionActions } = await import('./projection.store.svelte');
      const { globalActions } =
        await import('$lib/features/commons/store/global.svelte');

      projectionActions.setViewMode(ViewMode.GRID);

      expect(globalActions.setProjectionViewMode).toHaveBeenCalledWith(
        ViewMode.GRID
      );
    });
  });

  describe('setCenter', () => {
    it('updates longitude and latitude', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setCenter(45, 30);

      const state = getProjectionState();
      expect(state.longitude).toBe(45);
      expect(state.latitude).toBe(30);
      expect(state.center).toEqual([45, 30]);
    });

    it('calls map.setCenter when map is available', async () => {
      const { projectionActions } = await import('./projection.store.svelte');
      const { mapInstanceStore } =
        await import('$lib/features/commons/store/map-instance.store.svelte');

      projectionActions.setCenter(10, 20);

      expect(mapInstanceStore.map?.setCenter).toHaveBeenCalledWith([10, 20]);
    });
  });

  describe('setRotation', () => {
    it('updates rotation value', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setRotation(45);

      const state = getProjectionState();
      expect(state.rotation).toBe(45);
    });

    it('calls map.setBearing when map is available', async () => {
      const { projectionActions } = await import('./projection.store.svelte');
      const { mapInstanceStore } =
        await import('$lib/features/commons/store/map-instance.store.svelte');

      projectionActions.setRotation(30);

      expect(mapInstanceStore.map?.setBearing).toHaveBeenCalledWith(30);
    });
  });

  describe('setScale', () => {
    it('updates scale value', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setScale(2.5);

      const state = getProjectionState();
      expect(state.scale).toBe(2.5);
    });

    it('clamps scale to minimum of 0.1', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setScale(0.01);

      const state = getProjectionState();
      expect(state.scale).toBe(0.1);
    });

    it('clamps scale to maximum of 10', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');

      projectionActions.setScale(20);

      const state = getProjectionState();
      expect(state.scale).toBe(10);
    });
  });

  describe('suggestProjectionForCurrentData', () => {
    it('does nothing when no geo datasets', async () => {
      const { projectionActions } = await import('./projection.store.svelte');
      const { datasetsStore } =
        await import('$lib/features/commons/store/datasets.store.svelte');
      const { suggestProjection } =
        await import('$lib/features/commons/utils/projection.utils');

      vi.mocked(datasetsStore.getDatasetsByType).mockReturnValue([]);
      projectionActions.suggestProjectionForCurrentData();

      expect(suggestProjection).not.toHaveBeenCalled();
    });

    it('suggests projection based on dataset bounds', async () => {
      const { projectionActions, getProjectionState } =
        await import('./projection.store.svelte');
      const { datasetsStore } =
        await import('$lib/features/commons/store/datasets.store.svelte');
      const { suggestProjection } =
        await import('$lib/features/commons/utils/projection.utils');

      vi.mocked(datasetsStore.getDatasetsByType).mockReturnValue([
        {
          geometry: {
            bounds: [-180, -90, 180, 90]
          }
        }
      ] as never);
      vi.mocked(suggestProjection).mockReturnValue('robinson');

      projectionActions.suggestProjectionForCurrentData();

      expect(suggestProjection).toHaveBeenCalled();
      const state = getProjectionState();
      expect(state.selected).toBe('robinson');
    });
  });

  describe('getCurrentProjectionInfo', () => {
    it('returns projection info for selected projection', async () => {
      const { projectionActions } = await import('./projection.store.svelte');

      projectionActions.setSelected('equirectangular');
      const info = projectionActions.getCurrentProjectionInfo();

      expect(info).toBeDefined();
      expect(info?.id).toBe('equirectangular');
    });
  });

  describe('applyProjectionToDataset', () => {
    it('returns null when dataset not found', async () => {
      const { projectionActions } = await import('./projection.store.svelte');

      const result = projectionActions.applyProjectionToDataset(
        'non-existent',
        800,
        600
      );

      expect(result).toBeNull();
    });
  });
});
