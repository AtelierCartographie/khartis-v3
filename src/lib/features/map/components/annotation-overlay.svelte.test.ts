import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnnotationKind,
  DEFAULT_MARGINS,
  DrawingType
} from '$lib/features/commons/constants/ui.constants';
import {
  PAGE_PRESETS,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import {
  globalActions,
  globalState
} from '$lib/features/commons/store/global.svelte';
import { StylingTools } from '$lib/features/commons/types/global';
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import {
  annotationsActions,
  getAnnotationsState
} from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
import AnnotationOverlay from './annotation-overlay.svelte';

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

describe('annotation overlay drawing interactions', () => {
  beforeEach(() => {
    cleanup();
    annotationsActions.reset();
    globalActions.resetNavigationState();
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
    annotationsActions.reset();
    globalActions.resetNavigationState();
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
    expect(zone.coordinateSpace).toBe('page');
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
});
