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

    expect(setProps).toHaveBeenCalledWith({
      initialViewState: {
        main: expect.objectContaining({
          target: [0, 0, 0],
          zoom: 0
        })
      }
    });
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
});
