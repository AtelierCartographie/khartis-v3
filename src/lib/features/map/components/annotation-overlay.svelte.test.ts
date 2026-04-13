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

function setupDrawingCapture(): HTMLElement {
  const { container } = render(AnnotationOverlay);
  const mapLayer = container.querySelector('.annotation-map-layer');
  const drawingCapture = container.querySelector('.drawing-capture');

  if (!(mapLayer instanceof HTMLDivElement)) {
    throw new Error('Map layer was not rendered');
  }

  if (!(drawingCapture instanceof HTMLElement)) {
    throw new Error('Drawing capture layer was not rendered');
  }

  Object.defineProperty(mapLayer, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(400, 300)
  });

  Object.defineProperty(drawingCapture, 'setPointerCapture', {
    configurable: true,
    value: () => {}
  });

  Object.defineProperty(drawingCapture, 'releasePointerCapture', {
    configurable: true,
    value: () => {}
  });

  return drawingCapture;
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

  it('keeps zone drawings active when the pointer is released away from the starting point', async () => {
    annotationsActions.startDrawingMode(DrawingType.ZONE);

    const drawingCapture = setupDrawingCapture();

    await fireEvent.pointerDown(drawingCapture, {
      pointerId: 1,
      clientX: 20,
      clientY: 20
    });
    await fireEvent.pointerMove(drawingCapture, {
      pointerId: 1,
      clientX: 120,
      clientY: 20
    });
    await fireEvent.pointerMove(drawingCapture, {
      pointerId: 1,
      clientX: 140,
      clientY: 100
    });
    await fireEvent.pointerUp(drawingCapture, {
      pointerId: 1,
      clientX: 220,
      clientY: 120
    });

    await waitFor(() => {
      const state = getAnnotationsState();
      expect(state.isDrawingMode).toBe(true);
      expect(state.items).toHaveLength(0);
      expect(state.drawingInProgress.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('auto-closes zone drawings when the pointer is released near the starting point', async () => {
    annotationsActions.startDrawingMode(DrawingType.ZONE);

    const drawingCapture = setupDrawingCapture();

    await fireEvent.pointerDown(drawingCapture, {
      pointerId: 1,
      clientX: 20,
      clientY: 20
    });
    await fireEvent.pointerMove(drawingCapture, {
      pointerId: 1,
      clientX: 120,
      clientY: 20
    });
    await fireEvent.pointerMove(drawingCapture, {
      pointerId: 1,
      clientX: 120,
      clientY: 120
    });
    await fireEvent.pointerMove(drawingCapture, {
      pointerId: 1,
      clientX: 24,
      clientY: 24
    });
    await fireEvent.pointerUp(drawingCapture, {
      pointerId: 1,
      clientX: 22,
      clientY: 22
    });

    await waitFor(() => {
      const state = getAnnotationsState();
      expect(state.isDrawingMode).toBe(false);
      expect(state.drawingInProgress).toHaveLength(0);
      expect(state.items).toHaveLength(1);
    });

    const [zone] = getAnnotationsState().items;
    expect(zone.type).toBe(AnnotationKind.DRAWING);
    expect(zone.style?.drawingType).toBe(DrawingType.ZONE);
    expect(Array.isArray(zone.content)).toBe(true);
    expect((zone.content as { x: number; y: number }[]).length).toBe(3);
  });
});
