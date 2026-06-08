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
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import {
  annotationsActions,
  getAnnotationsState
} from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
import { computeDrawingBounds } from '../utils/annotation-drawing.utils';
import { DRAGGING_STYLING_TARGET_BODY_CLASS } from '../utils/tool-popover-drag-visibility.utils';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import AnnotationOverlay from './annotation-overlay.svelte';

// Drive the map-anchoring helper from the deck view-state zoom so a data-anchored
// annotation's resolved screen position changes when the MAP zooms. Legacy/page
// tests never set an anchor, so they keep the pixel-page path untouched.
const anchorMocks = vi.hoisted(() => ({
  canAnchorToMap: vi.fn<() => boolean>(() => true),
  dataToScreenPx: vi.fn<
    (anchor: { lon: number; lat: number }) => { x: number; y: number } | null
  >(() => ({ x: 0, y: 0 })),
  screenPxToData: vi.fn<
    (x: number, y: number) => { lon: number; lat: number } | null
  >(() => ({ lon: 0, lat: 0 }))
}));

vi.mock('../utils/map-anchor-projection.utils', () => ({
  canAnchorToMap: anchorMocks.canAnchorToMap,
  dataToScreenPx: anchorMocks.dataToScreenPx,
  screenPxToData: anchorMocks.screenPxToData
}));

function extractPathPoints(
  path: string | null
): Array<{ x: number; y: number }> {
  if (!path) {
    return [];
  }

  return Array.from(
    path.matchAll(/[ML]\s(-?\d+(?:\.\d+)?)\s(-?\d+(?:\.\d+)?)/g)
  ).map(([, x, y]) => ({
    x: Number(x),
    y: Number(y)
  }));
}

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

  it('positions the drawing preview from its computed origin instead of the page top-left', () => {
    annotationsActions.beginDrawing(DrawingType.LINE);
    annotationsActions.updateDrawing([
      { x: 50, y: 60 },
      { x: 120, y: 90 }
    ]);

    const { container } = setupCaptureLayer();
    const preview = container.querySelector('.drawing-preview');

    expect(preview).toBeTruthy();
    expect(preview?.getAttribute('style')).toContain('left: 47px; top: 57px;');
  });

  it('keeps uneven high-smoothness drawings within tight rendered bounds', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 11, y: 100 },
      { x: 20, y: 100 }
    ];

    annotationsActions.updateDefaultStyle({ smoothness: 100 });
    annotationsActions.beginDrawing(DrawingType.LINE);
    annotationsActions.updateDrawing(points);
    annotationsActions.finishDrawing();

    const bounds = computeDrawingBounds(points, 2, 100, false);
    const { container } = render(AnnotationOverlay);
    const drawing = container.querySelector('.annotation-drawing');
    const path = container.querySelector('.annotation-drawing path');
    const pathSegments = path?.getAttribute('d')?.match(/L/g) ?? [];

    expect(drawing?.getAttribute('viewBox')).toBe(bounds.viewBox);
    expect(Number(drawing?.getAttribute('height'))).toBeLessThan(120);
    expect(pathSegments.length).toBeGreaterThan(points.length);
  });

  it('renders freehand drawings without smoothing by default', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 20 },
      { x: 40, y: 0 },
      { x: 60, y: 20 },
      { x: 120, y: 104 }
    ];

    annotationsActions.beginDrawing(DrawingType.LINE);
    annotationsActions.updateDrawing(points);
    annotationsActions.finishDrawing();

    const { container } = render(AnnotationOverlay);
    const path = container.querySelector('.annotation-drawing path');
    const pathPoints = extractPathPoints(path?.getAttribute('d') ?? null);

    expect(getAnnotationsState().items[0]?.style?.smoothness).toBe(0);
    expect(pathPoints).toHaveLength(points.length);
    expect(pathPoints[1]).toEqual(points[1]);
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

  it('scales page element positions with the rendered page size', () => {
    globalActions.setPageZoomScale(1.2);
    annotationsActions.initPageElements({ withPlaceholders: true });

    const { container } = render(AnnotationOverlay);
    const title = container.querySelector(
      '.annotation-item[data-annotation-role="title"]'
    );

    const style = title?.getAttribute('style');

    expect(style).toContain(`left: ${12 * 1.2}px`);
    expect(style).toContain(`top: ${12 * 1.2}px`);
    expect(style).toContain('transform: scale(1.2)');
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

  it('drags page text annotations to the right edge of the map frame', async () => {
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

    expect(getAnnotationsState().items[0]?.position.x).toBe(144);

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

  it('repositions a data-anchored map annotation when the map view state changes', async () => {
    anchorMocks.canAnchorToMap.mockReturnValue(true);
    anchorMocks.dataToScreenPx.mockImplementation(() => {
      const zoom = mapInstanceStore.deckViewState.zoom;
      return { x: zoom * 100, y: zoom * 50 };
    });

    annotationsActions.beginPlacement(AnnotationKind.SHAPE, 'circle');
    const placed = annotationsActions.commitPlacement({
      coordinateSpace: 'page',
      type: AnnotationKind.SHAPE,
      position: { x: 10, y: 10 },
      size: { width: 56, height: 56 },
      content: 'circle'
    });
    if (!placed) {
      throw new Error('Expected a placed shape annotation');
    }
    // Promote to a data-anchored map annotation.
    annotationsActions.updateAnnotation(placed.id, {
      coordinateSpace: 'map',
      anchor: { lon: 2.35, lat: 48.86 }
    });

    mapInstanceStore.updateDeckViewState({ target: [0, 0, 0], zoom: 1 });

    const { container } = render(AnnotationOverlay);
    const item = container.querySelector('.annotation-item');
    if (!(item instanceof HTMLElement)) {
      throw new Error('Annotation item was not rendered');
    }

    const zoom1 = mapInstanceStore.deckViewState.zoom;
    await waitFor(() => {
      expect(item.getAttribute('style')).toContain(`left: ${zoom1 * 100}px`);
    });

    mapInstanceStore.updateDeckViewState({ target: [0, 0, 0], zoom: 2 });

    const zoom2 = mapInstanceStore.deckViewState.zoom;
    expect(zoom2).not.toBe(zoom1);
    await waitFor(() => {
      expect(item.getAttribute('style')).toContain(`left: ${zoom2 * 100}px`);
    });

    anchorMocks.dataToScreenPx.mockReset();
    anchorMocks.dataToScreenPx.mockReturnValue({ x: 0, y: 0 });
    mapInstanceStore.reset();
  });
});
