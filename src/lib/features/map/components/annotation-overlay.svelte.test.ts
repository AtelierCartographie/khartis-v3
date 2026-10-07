// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnnotationKind,
  DEFAULT_MARGINS,
  DrawingType
} from '$lib/features/commons/constants/ui.constants';
import { SHAPE_TYPE } from '$lib/features/commons/constants';
import {
  PAGE_PRESETS,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import {
  globalActions,
  globalState
} from '$lib/features/commons/stores/global.svelte';
import { StylingTools } from '$lib/features/commons/types/global';
import {
  formatActions,
  getFormatState
} from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import {
  annotationsActions,
  getAnnotationsState
} from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
import { DRAGGING_STYLING_TARGET_BODY_CLASS } from '../utils/tool-popover-drag-visibility.utils';
import AnnotationOverlay from './annotation-overlay.svelte';

// No map instance exists in jsdom: anchoring is stubbed as available so that
// annotations drawn on the map are created in 'map' space.
const anchorMocks = vi.hoisted(() => ({
  canAnchorToMap: vi.fn<() => boolean>(() => true),
  dataToScreenPx: vi.fn<
    (anchor: { lon: number; lat: number }) => { x: number; y: number } | null
  >(() => ({ x: 0, y: 0 })),
  buildAnchorFromScreenPx: vi.fn<
    (
      x: number,
      y: number,
      scaleFactor?: number
    ) => { lon: number; lat: number } | null
  >(() => ({ lon: 0, lat: 0 })),
  getAnchorScaleFactor: vi.fn<(anchor: { lon: number; lat: number }) => number>(
    () => 1
  )
}));

vi.mock('../utils/map-anchor-projection.utils', () => ({
  canAnchorToMap: anchorMocks.canAnchorToMap,
  dataToScreenPx: anchorMocks.dataToScreenPx,
  buildAnchorFromScreenPx: anchorMocks.buildAnchorFromScreenPx,
  getAnchorScaleFactor: anchorMocks.getAnchorScaleFactor
}));

function getStylePx(style: string, property: string): number {
  const match = style.match(
    new RegExp(`${property}:\\s*(-?\\d+(?:\\.\\d+)?)px`)
  );
  if (!match) {
    throw new Error(`Missing ${property} in style ${style}`);
  }

  return Number(match[1]);
}

function getSelectedVectorStartPoint(container: HTMLElement): {
  x: number;
  y: number;
} {
  const item = Array.from(container.querySelectorAll('.annotation-item')).find(
    (item) => item.querySelector('svg.annotation-vector')
  );
  if (!(item instanceof HTMLElement)) {
    throw new Error('Expected a vector annotation item');
  }

  const svg = item.querySelector('svg.annotation-vector');
  const anchor = item.querySelector('.drawing-anchor');
  if (!(svg instanceof SVGSVGElement) || !(anchor instanceof Element)) {
    throw new Error('Expected selected vector handles');
  }

  const [originX, originY] = (svg.getAttribute('viewBox') ?? '')
    .split(' ')
    .map(Number);
  const style = item.getAttribute('style') ?? '';

  return {
    x: getStylePx(style, 'left') + Number(anchor.getAttribute('cx')) - originX,
    y: getStylePx(style, 'top') + Number(anchor.getAttribute('cy')) - originY
  };
}

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

function createDomRect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    toJSON() {
      return this;
    }
  } as DOMRect;
}

function setupCaptureLayer(): {
  capture: HTMLElement;
  container: HTMLElement;
} {
  const { container } = render(AnnotationOverlay);
  const overlay = container.querySelector('.annotation-overlay');
  const mapLayer = container.querySelector('.annotation-map-layer');
  const capture = container.querySelector('.annotation-capture-layer');

  if (!(overlay instanceof HTMLDivElement)) {
    throw new Error('Overlay was not rendered');
  }

  if (!(mapLayer instanceof HTMLDivElement)) {
    throw new Error('Map layer was not rendered');
  }

  if (!(capture instanceof HTMLElement)) {
    throw new Error('Capture layer was not rendered');
  }

  Object.defineProperty(overlay, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(400, 300)
  });

  Object.defineProperty(mapLayer, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(280, 180)
  });

  Object.defineProperty(capture, 'setPointerCapture', {
    configurable: true,
    value: () => {}
  });

  Object.defineProperty(capture, 'releasePointerCapture', {
    configurable: true,
    value: () => {}
  });

  return { capture, container: container as HTMLElement };
}

function setupAnnotationViewport(): {
  container: HTMLElement;
  item: HTMLElement;
  overlay: HTMLDivElement;
  viewport: HTMLDivElement;
} {
  const viewport = document.createElement('div');
  viewport.className = 'workspace-viewport';
  document.body.appendChild(viewport);

  const { container } = render(AnnotationOverlay, {
    target: viewport
  });
  const overlay = container.querySelector('.annotation-overlay');
  const item = container.querySelector('.annotation-item');

  if (!(overlay instanceof HTMLDivElement)) {
    throw new Error('Overlay was not rendered');
  }

  if (!(item instanceof HTMLElement)) {
    throw new Error('Annotation item was not rendered');
  }

  Object.defineProperty(viewport, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(400, 300)
  });
  Object.defineProperty(overlay, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(400, 300)
  });
  Object.defineProperty(item, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        x: 60,
        y: 40,
        width: 80,
        height: 80,
        top: 40,
        left: 60,
        right: 140,
        bottom: 120,
        toJSON() {
          return this;
        }
      }) as DOMRect
  });

  return {
    container: container as HTMLElement,
    item,
    overlay,
    viewport
  };
}

describe('annotation overlay drawing interactions', () => {
  beforeEach(() => {
    cleanup();
    annotationsActions.reset();
    globalActions.resetNavigationState();
    globalActions.setPageZoomScale(1);
    globalState.selectedTool = StylingTools.Annotations;
    formatActions.setSize(400, 300);
    formatActions.setMargins({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    annotationsActions.reset();
    globalActions.resetNavigationState();
    globalActions.setPageZoomScale(1);
    globalState.selectedTool = undefined;
    formatActions.setSize(
      PAGE_PRESETS[PageModel.A4_LANDSCAPE].width,
      PAGE_PRESETS[PageModel.A4_LANDSCAPE].height
    );
    formatActions.setMargins({ ...DEFAULT_MARGINS });
  });

  it('keeps the untouched vector anchor visually fixed when another anchor changes bounds', async () => {
    annotationsActions.addAnnotation(AnnotationKind.SHAPE, SHAPE_TYPE.ARROW);
    const arrow = getAnnotationsState().items.at(-1);
    if (!arrow) {
      throw new Error('Expected an arrow annotation');
    }

    annotationsActions.updateAnnotation(arrow.id, {
      coordinateSpace: 'page',
      position: { x: 80, y: 90 },
      style: {
        ...(arrow.style ?? {}),
        strokeWidth: 2,
        points: [
          { x: 0, y: 0 },
          { x: 120, y: 0 }
        ]
      }
    });

    const { container } = render(AnnotationOverlay);
    const before = getSelectedVectorStartPoint(container as HTMLElement);

    annotationsActions.updateAnnotation(arrow.id, {
      style: {
        ...(getAnnotationsState().items.find((item) => item.id === arrow.id)
          ?.style ?? {}),
        points: [
          { x: 0, y: 0 },
          { x: 176.56, y: 33.94 }
        ]
      }
    });

    await waitFor(() => {
      const after = getSelectedVectorStartPoint(container as HTMLElement);
      expect(after.x).toBeCloseTo(before.x, 3);
      expect(after.y).toBeCloseTo(before.y, 3);
    });
  });

  it('keeps zone drawings active when the pointer is released away from the starting point', async () => {
    annotationsActions.beginDrawing(DrawingType.ZONE);

    const { capture } = setupCaptureLayer();

    await fireEvent.pointerDown(capture, {
      pointerId: 1,
      clientX: 20,
      clientY: 20
    });
    await fireEvent.pointerMove(capture, {
      pointerId: 1,
      clientX: 120,
      clientY: 20
    });
    await fireEvent.pointerMove(capture, {
      pointerId: 1,
      clientX: 140,
      clientY: 100
    });
    await fireEvent.pointerUp(capture, {
      pointerId: 1,
      clientX: 220,
      clientY: 120
    });

    await waitFor(() => {
      const state = getAnnotationsState();
      expect(state.creationMode).toBe('drawing');
      expect(state.items).toHaveLength(0);
      expect(state.drawingInProgress.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('shows a closure halo and auto-closes zone drawings near the first point', async () => {
    annotationsActions.beginDrawing(DrawingType.ZONE);

    const { capture, container } = setupCaptureLayer();

    await fireEvent.pointerDown(capture, {
      pointerId: 1,
      clientX: 20,
      clientY: 20
    });
    await fireEvent.pointerMove(capture, {
      pointerId: 1,
      clientX: 120,
      clientY: 20
    });
    await fireEvent.pointerMove(capture, {
      pointerId: 1,
      clientX: 120,
      clientY: 120
    });
    await fireEvent.pointerMove(capture, {
      pointerId: 1,
      clientX: 24,
      clientY: 24
    });

    await waitFor(() => {
      expect(
        container.querySelector('.drawing-close-target-active')
      ).toBeTruthy();
    });

    await fireEvent.pointerUp(capture, {
      pointerId: 1,
      clientX: 22,
      clientY: 22
    });

    await waitFor(() => {
      const state = getAnnotationsState();
      expect(state.creationMode).toBe('idle');
      expect(state.drawingInProgress).toHaveLength(0);
      expect(state.items).toHaveLength(1);
    });

    const [zone] = getAnnotationsState().items;
    expect(zone.type).toBe(AnnotationKind.DRAWING);
    expect(zone.style?.drawingType).toBe(DrawingType.ZONE);
    // Drawn-on-the-map zones are created in `'map'` space so they follow the
    // basemap (margins are 0 here, so the placement position is unchanged).
    expect(zone.coordinateSpace).toBe('map');
  });

  it('finishes a zone drawing with Enter and cancels creation with Escape', async () => {
    annotationsActions.beginDrawing(DrawingType.ZONE);
    annotationsActions.updateDrawing([
      { x: 30, y: 30 },
      { x: 160, y: 30 },
      { x: 140, y: 120 }
    ]);

    setupCaptureLayer();

    await fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => {
      expect(getAnnotationsState().creationMode).toBe('idle');
      expect(getAnnotationsState().items).toHaveLength(1);
    });

    annotationsActions.beginPlacement(AnnotationKind.TEXT, 'Hello');
    setupCaptureLayer();

    await fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      const state = getAnnotationsState();
      expect(state.creationMode).toBe('idle');
      expect(state.pendingType).toBeNull();
    });
  });

  it('places page annotations outside the map frame and previews imported images before placement', async () => {
    formatActions.setMargins({
      top: 60,
      right: 60,
      bottom: 60,
      left: 60
    });
    annotationsActions.beginPlacement(
      AnnotationKind.IMAGE,
      'data:image/svg+xml;base64,PHN2Zy8+'
    );

    const { capture, container } = setupCaptureLayer();

    await fireEvent.pointerMove(capture, {
      pointerId: 1,
      clientX: 40,
      clientY: 40
    });

    await waitFor(() => {
      expect(container.querySelector('.annotation-preview-image')).toBeTruthy();
    });

    await fireEvent.pointerDown(capture, {
      pointerId: 1,
      clientX: 40,
      clientY: 40
    });

    await waitFor(() => {
      const state = getAnnotationsState();
      expect(state.creationMode).toBe('idle');
      expect(state.items).toHaveLength(1);
    });

    const [image] = getAnnotationsState().items;
    expect(image.coordinateSpace).toBe('page');
    expect(image.position).toEqual({ x: 0, y: 0 });
  });

  it('recenters the page when a centered annotation loses focus', async () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Focus item');

    const { item } = setupAnnotationViewport();

    await fireEvent.click(item);

    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 100, y: 70 });
    });

    vi.useFakeTimers();
    await fireEvent.blur(item);

    expect(globalState.zoom.pagePanOffset).toEqual({ x: 100, y: 70 });

    await vi.advanceTimersByTimeAsync(199);
    expect(globalState.zoom.pagePanOffset).toEqual({ x: 100, y: 70 });

    await vi.advanceTimersByTimeAsync(1);
    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 0, y: 0 });
    });
  });

  it('keeps centered annotation pan while a blurred item is being dragged', async () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Drag focus item');

    const { item } = setupAnnotationViewport();

    await fireEvent.click(item);

    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 100, y: 70 });
    });

    vi.useFakeTimers();
    await fireEvent.pointerDown(item, {
      clientX: 70,
      clientY: 50,
      pointerId: 1
    });
    await fireEvent.blur(item);
    await vi.advanceTimersByTimeAsync(250);

    expect(globalState.zoom.pagePanOffset).toEqual({ x: 100, y: 70 });

    await fireEvent.pointerUp(window, { pointerId: 1 });
    await vi.advanceTimersByTimeAsync(200);

    expect(globalState.zoom.pagePanOffset).toEqual({ x: 0, y: 0 });
  });

  it('does not auto-center from the synthetic click after a drag', async () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Drag click item');

    const { item } = setupAnnotationViewport();

    vi.useFakeTimers();
    await fireEvent.pointerDown(item, {
      clientX: 70,
      clientY: 50,
      pointerId: 1
    });
    await fireEvent.pointerMove(window, {
      clientX: 120,
      clientY: 50,
      pointerId: 1
    });
    await fireEvent.pointerUp(window, { pointerId: 1 });
    await fireEvent.click(item);

    expect(globalState.zoom.pagePanOffset).toEqual({ x: 0, y: 0 });
  });

  it('drags page text annotations to the right edge of the page, past the map frame', async () => {
    formatActions.toggleGrid();
    formatActions.setMargins({
      top: 40,
      right: 40,
      bottom: 40,
      left: 40
    });
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Right edge');

    const [note] = getAnnotationsState().items;
    if (!note) {
      throw new Error('Expected a note annotation');
    }
    const { container } = render(AnnotationOverlay);
    const overlay = container.querySelector('.annotation-overlay');
    const item = container.querySelector('.annotation-item');

    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(item).toBeInstanceOf(HTMLElement);

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(item instanceof HTMLElement)
    ) {
      return;
    }

    Object.defineProperty(overlay, 'getBoundingClientRect', {
      configurable: true,
      value: () => createDomRect(400, 300)
    });
    Object.defineProperty(item, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          x: note.position.x,
          y: note.position.y,
          width: 216,
          height: 28,
          top: note.position.y,
          left: note.position.x,
          right: note.position.x + 216,
          bottom: note.position.y + 28,
          toJSON() {
            return this;
          }
        }) as DOMRect
    });

    await fireEvent.pointerDown(item, {
      clientX: note.position.x + 5,
      clientY: note.position.y + 5,
      pointerId: 1
    });

    expect(
      document.body.classList.contains(DRAGGING_STYLING_TARGET_BODY_CLASS)
    ).toBe(true);

    await fireEvent.pointerMove(window, {
      clientX: 600,
      clientY: note.position.y + 5,
      pointerId: 1
    });

    expect(getAnnotationsState().items[0]?.position.x).toBe(184);

    await fireEvent.pointerUp(window, { pointerId: 1 });

    expect(
      document.body.classList.contains(DRAGGING_STYLING_TARGET_BODY_CLASS)
    ).toBe(false);
  });
  it('deletes a focused annotation with Delete', async () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Delete me');

    const { item } = setupAnnotationViewport();

    item.focus();
    await fireEvent.keyDown(item, { key: 'Delete' });

    await waitFor(() => {
      expect(getAnnotationsState().items).toHaveLength(0);
    });
  });

  it('deletes a focused annotation with Backspace and resets centered pan', async () => {
    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Delete me too');

    const { item } = setupAnnotationViewport();

    await fireEvent.click(item);

    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 100, y: 70 });
    });

    item.focus();
    await fireEvent.keyDown(item, { key: 'Backspace' });

    await waitFor(() => {
      expect(getAnnotationsState().items).toHaveLength(0);
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 0, y: 0 });
    });
  });

  it('moves a focused annotation with arrow keys and deselects it with Escape', async () => {
    if (getFormatState().gridEnabled) {
      formatActions.toggleGrid();
    }

    annotationsActions.addAnnotation(AnnotationKind.TEXT, 'Move me');
    const [note] = getAnnotationsState().items;
    if (!note) {
      throw new Error('Expected a note annotation');
    }
    annotationsActions.updateAnnotation(note.id, {
      coordinateSpace: 'page',
      position: { x: 40, y: 50 }
    });

    const { item } = setupAnnotationViewport();

    item.focus();
    await fireEvent.keyDown(item, { key: 'ArrowRight' });

    expect(getAnnotationsState().items[0]?.position).toEqual({
      x: 41,
      y: 50
    });
    expect(getAnnotationsState().selectedId).toBe(note.id);

    await fireEvent.keyDown(item, { key: 'Escape' });

    expect(getAnnotationsState().selectedId).toBeNull();
  });
});
