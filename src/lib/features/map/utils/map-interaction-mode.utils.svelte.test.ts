import { describe, expect, it, vi } from 'vitest';
import {
  resolveOrthographicInteractionController,
  syncMapLibreInteractionMode,
  syncOrthographicInteractionMode,
  type MapLibreInteractionMap,
  type OrthographicInteractiveDeck
} from './map-interaction-mode.utils';

function createHandler() {
  return {
    enable: vi.fn(),
    disable: vi.fn()
  };
}

function createMapMock(): MapLibreInteractionMap {
  return {
    dragPan: createHandler(),
    scrollZoom: createHandler(),
    doubleClickZoom: createHandler(),
    boxZoom: createHandler(),
    keyboard: createHandler(),
    touchZoomRotate: {
      ...createHandler(),
      disableRotation: vi.fn()
    },
    dragRotate: createHandler(),
    resize: vi.fn(),
    triggerRepaint: vi.fn()
  };
}

describe('map interaction mode utils', () => {
  it('disables all MapLibre gestures in page mode', () => {
    const map = createMapMock();
    const scheduleFrame = vi.fn();

    syncMapLibreInteractionMode(map, true, scheduleFrame);

    expect(map.dragPan.disable).toHaveBeenCalledTimes(1);
    expect(map.scrollZoom.disable).toHaveBeenCalledTimes(1);
    expect(map.doubleClickZoom.disable).toHaveBeenCalledTimes(1);
    expect(map.boxZoom.disable).toHaveBeenCalledTimes(1);
    expect(map.keyboard.disable).toHaveBeenCalledTimes(1);
    expect(map.touchZoomRotate.disable).toHaveBeenCalledTimes(1);
    expect(map.dragRotate.disable).toHaveBeenCalledTimes(1);
    expect(map.resize).not.toHaveBeenCalled();
    expect(scheduleFrame).not.toHaveBeenCalled();
  });

  it('re-enables MapLibre gestures and forces a resync when returning to map mode', () => {
    const map = createMapMock();
    const scheduleFrame = vi.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    syncMapLibreInteractionMode(map, false, scheduleFrame);

    expect(map.dragPan.enable).toHaveBeenCalledTimes(1);
    expect(map.scrollZoom.enable).toHaveBeenCalledTimes(1);
    expect(map.doubleClickZoom.enable).toHaveBeenCalledTimes(1);
    expect(map.boxZoom.enable).toHaveBeenCalledTimes(1);
    expect(map.keyboard.enable).toHaveBeenCalledTimes(1);
    expect(map.touchZoomRotate.enable).toHaveBeenCalledTimes(1);
    expect(map.touchZoomRotate.disableRotation).toHaveBeenCalledTimes(1);
    expect(map.dragRotate.disable).toHaveBeenCalledTimes(1);
    expect(map.resize).toHaveBeenCalledTimes(2);
    expect(map.triggerRepaint).toHaveBeenCalledTimes(2);
    expect(scheduleFrame).toHaveBeenCalledTimes(1);
  });

  it('returns the expected orthographic controller for each zoom mode', () => {
    expect(resolveOrthographicInteractionController(true)).toEqual({
      dragPan: false,
      scrollZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false
    });
    expect(resolveOrthographicInteractionController(false)).toEqual({
      dragPan: true,
      scrollZoom: false,
      doubleClickZoom: false,
      touchZoom: true,
      keyboard: true
    });
  });

  it('updates the orthographic controller and redraws immediately plus on next frame', () => {
    const deck: OrthographicInteractiveDeck = {
      setProps: vi.fn(),
      redraw: vi.fn()
    };
    const scheduleFrame = vi.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    syncOrthographicInteractionMode(deck, false, scheduleFrame);

    expect(deck.setProps).toHaveBeenCalledWith({
      controller: resolveOrthographicInteractionController(false)
    });
    expect(deck.redraw).toHaveBeenCalledTimes(2);
    expect(deck.redraw).toHaveBeenNthCalledWith(1, 'zoomModeChange');
    expect(deck.redraw).toHaveBeenNthCalledWith(2, 'zoomModeChangeFrame');
  });
});
