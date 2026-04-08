import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';

export type ZoomMode = 'map' | 'page';
const ZOOM_MODE_MAP: ZoomMode = 'map';
const ZOOM_MODE_PAGE: ZoomMode = 'page';

function createZoomModeStore() {
  let mode = $state<ZoomMode>(ZOOM_MODE_MAP);

  function setMapMode(): void {
    mode = ZOOM_MODE_MAP;
    persistenceRegistry.notifyChange('zoomMode');
  }

  function setPageMode(): void {
    mode = ZOOM_MODE_PAGE;
    persistenceRegistry.notifyChange('zoomMode');
  }

  function toggle(): void {
    mode = mode === ZOOM_MODE_MAP ? ZOOM_MODE_PAGE : ZOOM_MODE_MAP;
    persistenceRegistry.notifyChange('zoomMode');
  }

  function setMode(nextMode: ZoomMode): void {
    mode = nextMode;
  }

  function restoreFromSerialized(nextMode: unknown): void {
    mode = nextMode === ZOOM_MODE_PAGE ? ZOOM_MODE_PAGE : ZOOM_MODE_MAP;
  }

  function reset(): void {
    mode = ZOOM_MODE_MAP;
  }

  return {
    get mode(): ZoomMode {
      return mode;
    },
    get isMapMode(): boolean {
      return mode === ZOOM_MODE_MAP;
    },
    get isPageMode(): boolean {
      return mode === ZOOM_MODE_PAGE;
    },
    setMapMode,
    setPageMode,
    toggle,
    setMode(nextMode: ZoomMode) {
      setMode(nextMode);
      persistenceRegistry.notifyChange('zoomMode');
    },
    restoreFromSerialized,
    reset
  };
}

export const zoomModeStore = createZoomModeStore();

persistenceRegistry.register({
  key: 'zoomMode',
  serialize: () => zoomModeStore.mode,
  deserialize: (data: unknown) => zoomModeStore.restoreFromSerialized(data),
  reset: () => zoomModeStore.reset(),
  priority: 'debounced'
});
