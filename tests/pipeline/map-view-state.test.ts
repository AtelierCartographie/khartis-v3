import { afterEach, describe, expect, it, vi } from 'vitest';

describe('map view state persistence', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('marks orthographic auto-fit updates for persistence', async () => {
    const notifyChange = vi.fn();
    const register = vi.fn();

    vi.doMock(
      '$lib/features/project-management/core/persistence-registry',
      () => ({
        persistenceRegistry: {
          register,
          notifyChange
        }
      })
    );

    const { mapInstanceStore } =
      await import('$lib/features/commons/store/map-instance.store.svelte');
    const { projectionStore } =
      await import('$lib/features/map/stores/projection.store.svelte');
    const registeredEntry = register.mock.calls[0]?.[0] as {
      serialize: () => { zoom: number; target: [number, number, number] };
    };

    const setProps = vi.fn();
    mapInstanceStore.setDeckInstance({
      setProps
    } as unknown as Parameters<typeof mapInstanceStore.setDeckInstance>[0]);
    mapInstanceStore.setMapLoaded(true);

    projectionStore.updateCanvasSize({ width: 960, height: 600 });
    projectionStore.setReferenceBbox([704320, 6276820, 783140, 6359140]);

    mapInstanceStore.fitToOrthographicBounds();

    expect(setProps).toHaveBeenCalledWith(
      expect.objectContaining({
        initialViewState: {
          main: expect.objectContaining({
            target: [0, 0, 0],
            zoom: 0
          })
        }
      })
    );
    expect(notifyChange).toHaveBeenCalledWith('mapViewState');
    expect(registeredEntry.serialize()).toEqual({
      zoom: 0,
      target: [743730, 6317980, 0]
    });
  });

  it('keeps the last valid serialized target when projection bounds are temporarily unavailable', async () => {
    const notifyChange = vi.fn();
    const register = vi.fn();

    vi.doMock(
      '$lib/features/project-management/core/persistence-registry',
      () => ({
        persistenceRegistry: {
          register,
          notifyChange
        }
      })
    );

    const { mapInstanceStore } =
      await import('$lib/features/commons/store/map-instance.store.svelte');
    const { projectionStore } =
      await import('$lib/features/map/stores/projection.store.svelte');
    const registeredEntry = register.mock.calls[0]?.[0] as {
      serialize: () => { zoom: number; target: [number, number, number] };
    };

    mapInstanceStore.setDeckInstance({
      setProps: vi.fn()
    } as unknown as Parameters<typeof mapInstanceStore.setDeckInstance>[0]);
    mapInstanceStore.setMapLoaded(true);

    projectionStore.updateCanvasSize({ width: 960, height: 600 });
    projectionStore.setReferenceBbox([704320, 6276820, 783140, 6359140]);
    mapInstanceStore.fitToOrthographicBounds();

    projectionStore.clear();
    mapInstanceStore.updateDeckViewState({
      target: [480, 250, 0],
      zoom: 0
    });

    expect(registeredEntry.serialize()).toEqual({
      zoom: 0,
      target: [743730, 6317980, 0]
    });
  });

  it('clears a restored orthographic target when persistence resets', async () => {
    const notifyChange = vi.fn();
    const register = vi.fn();

    vi.doMock(
      '$lib/features/project-management/core/persistence-registry',
      () => ({
        persistenceRegistry: {
          register,
          notifyChange
        }
      })
    );

    const { mapInstanceStore } =
      await import('$lib/features/commons/store/map-instance.store.svelte');
    const { projectionStore } =
      await import('$lib/features/map/stores/projection.store.svelte');
    const registeredEntry = register.mock.calls[0]?.[0] as {
      reset: () => void;
    };

    const setProps = vi.fn();
    mapInstanceStore.setDeckInstance({
      setProps
    } as unknown as Parameters<typeof mapInstanceStore.setDeckInstance>[0]);
    mapInstanceStore.setMapLoaded(true);

    projectionStore.updateCanvasSize({ width: 960, height: 600 });
    projectionStore.setReferenceBbox([704320, 6276820, 783140, 6359140]);

    mapInstanceStore.restoreFromSerialized({
      zoom: 1.25,
      target: [750000, 6330000, 0]
    });

    expect(mapInstanceStore.hasPendingRestore).toBe(true);

    registeredEntry.reset();
    mapInstanceStore.fitToOrthographicBounds();

    expect(mapInstanceStore.hasPendingRestore).toBe(false);
    expect(setProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialViewState: {
          main: expect.objectContaining({
            target: [0, 0, 0],
            zoom: 0
          })
        }
      })
    );
  });

  it('drops the saved orthographic restore before a forced refit', async () => {
    const notifyChange = vi.fn();
    const register = vi.fn();

    vi.doMock(
      '$lib/features/project-management/core/persistence-registry',
      () => ({
        persistenceRegistry: {
          register,
          notifyChange
        }
      })
    );

    const { mapInstanceStore } =
      await import('$lib/features/commons/store/map-instance.store.svelte');
    const { projectionStore } =
      await import('$lib/features/map/stores/projection.store.svelte');

    const setProps = vi.fn();
    mapInstanceStore.setDeckInstance({
      setProps
    } as unknown as Parameters<typeof mapInstanceStore.setDeckInstance>[0]);
    mapInstanceStore.setMapLoaded(true);

    projectionStore.updateCanvasSize({ width: 960, height: 600 });
    projectionStore.setReferenceBbox([704320, 6276820, 783140, 6359140]);

    mapInstanceStore.restoreFromSerialized({
      zoom: 1.25,
      target: [750000, 6330000, 0]
    });

    expect(mapInstanceStore.hasPendingRestore).toBe(true);

    mapInstanceStore.clearPersistedViewState();
    mapInstanceStore.fitToOrthographicBounds();

    expect(mapInstanceStore.hasPendingRestore).toBe(false);
    expect(setProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialViewState: {
          main: expect.objectContaining({
            target: [0, 0, 0],
            zoom: 0
          })
        }
      })
    );
  });

  it('tracks viewport fit mode transitions between auto-fit and manual camera changes', async () => {
    const notifyChange = vi.fn();
    const register = vi.fn();

    vi.doMock(
      '$lib/features/project-management/core/persistence-registry',
      () => ({
        persistenceRegistry: {
          register,
          notifyChange
        }
      })
    );

    const { mapInstanceStore } =
      await import('$lib/features/commons/store/map-instance.store.svelte');
    const { projectionStore } =
      await import('$lib/features/map/stores/projection.store.svelte');

    mapInstanceStore.setDeckInstance({
      setProps: vi.fn()
    } as unknown as Parameters<typeof mapInstanceStore.setDeckInstance>[0]);
    mapInstanceStore.setMapLoaded(true);

    projectionStore.updateCanvasSize({ width: 960, height: 600 });
    projectionStore.setReferenceBbox([704320, 6276820, 783140, 6359140]);

    mapInstanceStore.fitToOrthographicBounds('dataset');

    expect(mapInstanceStore.viewportFitMode).toBe('auto');
    expect(mapInstanceStore.viewportFitReason).toBe('dataset');

    mapInstanceStore.updateDeckViewState(
      {
        target: [120, 80, 0],
        zoom: 0.5
      },
      true
    );

    expect(mapInstanceStore.viewportFitMode).toBe('manual');
    expect(mapInstanceStore.viewportFitReason).toBeNull();

    mapInstanceStore.fitToOrthographicBounds('projection');

    expect(mapInstanceStore.viewportFitMode).toBe('auto');
    expect(mapInstanceStore.viewportFitReason).toBe('projection');
  });
});
