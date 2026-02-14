export type ZoomMode = 'map' | 'page';
const ZOOM_MODE_MAP: ZoomMode = 'map';
const ZOOM_MODE_PAGE: ZoomMode = 'page';

function createZoomModeStore() {
  let mode = $state<ZoomMode>(ZOOM_MODE_MAP);

  function setMapMode(): void {
    mode = ZOOM_MODE_MAP;
  }

  function setPageMode(): void {
    mode = ZOOM_MODE_PAGE;
  }

  function toggle(): void {
    mode = mode === ZOOM_MODE_MAP ? ZOOM_MODE_PAGE : ZOOM_MODE_MAP;
  }

  function setMode(nextMode: ZoomMode): void {
    mode = nextMode;
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
    setMode
  };
}

export const zoomModeStore = createZoomModeStore();
