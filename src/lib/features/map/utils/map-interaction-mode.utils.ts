export interface MapLibreInteractionHandler {
  enable: () => void;
  disable: () => void;
}

export interface MapLibreTouchZoomRotateHandler extends MapLibreInteractionHandler {
  disableRotation: () => void;
}

export interface MapLibreInteractionMap {
  dragPan: MapLibreInteractionHandler;
  scrollZoom: MapLibreInteractionHandler;
  doubleClickZoom: MapLibreInteractionHandler;
  boxZoom: MapLibreInteractionHandler;
  keyboard: MapLibreInteractionHandler;
  touchZoomRotate: MapLibreTouchZoomRotateHandler;
  dragRotate: MapLibreInteractionHandler;
  resize: () => void;
  triggerRepaint: () => void;
}

export interface OrthographicInteractionController {
  dragPan: boolean;
  scrollZoom: boolean;
  doubleClickZoom: boolean;
  touchZoom: boolean;
  keyboard: boolean;
}

export interface OrthographicInteractiveDeck {
  setProps: (props: { controller: OrthographicInteractionController }) => void;
  redraw: (reason?: string) => void;
}

export function resolveOrthographicInteractionController(
  isPageMode: boolean
): OrthographicInteractionController {
  return isPageMode
    ? {
        dragPan: false,
        scrollZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        keyboard: false
      }
    : {
        dragPan: true,
        scrollZoom: false,
        doubleClickZoom: false,
        touchZoom: true,
        keyboard: true
      };
}

export function syncMapLibreInteractionMode(
  map: MapLibreInteractionMap,
  isPageMode: boolean,
  scheduleFrame: (cb: FrameRequestCallback) => number = requestAnimationFrame
): void {
  if (isPageMode) {
    map.dragPan.disable();
    map.scrollZoom.disable();
    map.doubleClickZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    map.touchZoomRotate.disable();
    map.dragRotate.disable();
    return;
  }

  map.dragPan.enable();
  map.scrollZoom.enable();
  map.doubleClickZoom.enable();
  map.boxZoom.enable();
  map.keyboard.enable();
  map.touchZoomRotate.enable();
  map.touchZoomRotate.disableRotation();
  map.dragRotate.disable();
  map.resize();
  map.triggerRepaint();
  scheduleFrame(() => {
    map.resize();
    map.triggerRepaint();
  });
}

export function syncOrthographicInteractionMode(
  deck: OrthographicInteractiveDeck,
  isPageMode: boolean,
  scheduleFrame: (cb: FrameRequestCallback) => number = requestAnimationFrame
): void {
  deck.setProps({
    controller: resolveOrthographicInteractionController(isPageMode)
  });
  deck.redraw('zoomModeChange');
  scheduleFrame(() => {
    deck.redraw('zoomModeChangeFrame');
  });
}
