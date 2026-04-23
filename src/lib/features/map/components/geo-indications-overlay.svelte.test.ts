import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  globalActions,
  globalState
} from '$lib/features/commons/store/global.svelte';
import { StylingTools } from '$lib/features/commons/types/global';
import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
import { formatActions } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
import {
  geoIndicationsActions,
  geoIndicationsState
} from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.store.svelte';
import GeoIndicationsOverlay from './geo-indications-overlay.svelte';

const { mockFetch, mockWaitForInitialization, mockInitDuckDb } = vi.hoisted(
  () => ({
    mockFetch: vi.fn(async () => ({ ok: false }) as Response),
    mockWaitForInitialization: vi.fn(async () => undefined),
    mockInitDuckDb: vi.fn(async () => undefined)
  })
);

vi.mock('$lib/features/duckdb', () => ({
  Duck: class DuckMock {},
  initDuckDB: mockInitDuckDb,
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326'
  },
  duckDBOrchestrator: {
    waitForInitialization: mockWaitForInitialization
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    waitForInitialization: mockWaitForInitialization
  }
}));

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
  vi.stubGlobal('fetch', mockFetch);
});

function createDomRect(
  left: number,
  top: number,
  width: number,
  height: number
): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    left,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    }
  } as DOMRect;
}

function bindElementBox(
  element: HTMLElement,
  box: { left: number; top: number; width: number; height: number }
): void {
  Object.defineProperty(element, 'offsetWidth', {
    configurable: true,
    get: () => box.width
  });
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    get: () => box.height
  });
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(box.left, box.top, box.width, box.height)
  });
}

function setupGeoViewport(): {
  scale: HTMLDivElement;
  viewport: HTMLDivElement;
} {
  const viewport = document.createElement('div');
  viewport.className = 'workspace-viewport';
  document.body.appendChild(viewport);

  const { container } = render(GeoIndicationsOverlay, {
    target: viewport
  });
  const scale = container.querySelector('.scale-bar');

  if (!(scale instanceof HTMLDivElement)) {
    throw new Error('Scale bar was not rendered');
  }

  bindElementBox(viewport, {
    left: 0,
    top: 0,
    width: 400,
    height: 300
  });
  bindElementBox(scale, {
    left: 70,
    top: 105,
    width: 80,
    height: 30
  });

  return { scale, viewport };
}

function setupEmptyGeoViewport(): {
  viewport: HTMLDivElement;
} {
  const viewport = document.createElement('div');
  viewport.className = 'workspace-viewport';
  document.body.appendChild(viewport);

  bindElementBox(viewport, {
    left: 0,
    top: 0,
    width: 300,
    height: 200
  });

  render(GeoIndicationsOverlay, {
    target: viewport
  });

  return { viewport };
}

describe('geo indications overlay dragging', () => {
  beforeEach(() => {
    cleanup();
    mockFetch.mockClear();
    mockWaitForInitialization.mockClear();
    formatActions.reset();
    formatActions.setSize(300, 200);
    formatActions.setMargins({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    });
    geoIndicationsActions.reset();
    mapInstanceStore.reset();
    globalActions.resetNavigationState();
    globalState.selectedTool = StylingTools.GeoIndications;
  });

  afterEach(() => {
    cleanup();
    formatActions.reset();
    geoIndicationsActions.reset();
    mapInstanceStore.reset();
    globalActions.resetNavigationState();
  });

  it('snaps and clamps scale dragging to the shared page grid when enabled', async () => {
    geoIndicationsActions.toggleScale();

    const { container } = render(GeoIndicationsOverlay);
    const overlay = container.querySelector('.geo-indications-overlay');
    const scale = container.querySelector('.scale-bar');

    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(scale).toBeInstanceOf(HTMLDivElement);

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(scale instanceof HTMLDivElement)
    ) {
      return;
    }

    const overlayBox = { left: 0, top: 0, width: 300, height: 200 };
    const scaleBox = { left: 14, top: 130, width: 60, height: 26 };

    bindElementBox(overlay, overlayBox);
    bindElementBox(scale, scaleBox);

    await fireEvent.pointerDown(scale, {
      clientX: 18,
      clientY: 140
    });
    await fireEvent.pointerMove(window, {
      clientX: 600,
      clientY: 400
    });

    expect(geoIndicationsState.scale.dragPosition).toEqual({
      x: 240,
      y: 168
    });
  });

  it('keeps orientation dragging free-form when the grid is disabled', async () => {
    geoIndicationsActions.toggleOrientation();
    formatActions.toggleGrid();

    const { container } = render(GeoIndicationsOverlay);
    const overlay = container.querySelector('.geo-indications-overlay');
    const orientation = container.querySelector('.north-arrow');

    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(orientation).toBeInstanceOf(HTMLDivElement);

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(orientation instanceof HTMLDivElement)
    ) {
      return;
    }

    const overlayBox = { left: 0, top: 0, width: 300, height: 200 };
    const orientationBox = { left: 220, top: 18, width: 30, height: 40 };

    bindElementBox(overlay, overlayBox);
    bindElementBox(orientation, orientationBox);

    await fireEvent.pointerDown(orientation, {
      clientX: 228,
      clientY: 26
    });
    await fireEvent.pointerMove(window, {
      clientX: 251,
      clientY: 47
    });

    expect(geoIndicationsState.orientation.dragPosition).toEqual({
      x: 243,
      y: 39
    });
  });

  it('reclamps an inset map after the page size shrinks', async () => {
    geoIndicationsActions.toggleInsetMap();
    geoIndicationsActions.setInsetMapSize(80);

    const { container } = render(GeoIndicationsOverlay);
    const overlay = container.querySelector('.geo-indications-overlay');
    const inset = container.querySelector('.inset-map-panel');

    expect(overlay).toBeInstanceOf(HTMLDivElement);
    expect(inset).toBeInstanceOf(HTMLDivElement);

    if (
      !(overlay instanceof HTMLDivElement) ||
      !(inset instanceof HTMLDivElement)
    ) {
      return;
    }

    const overlayBox = { left: 0, top: 0, width: 300, height: 200 };
    const insetBox = { left: 216, top: 96, width: 80, height: 80 };

    bindElementBox(overlay, overlayBox);
    bindElementBox(inset, insetBox);

    geoIndicationsActions.setInsetMapDragPosition({ x: 216, y: 96 });

    overlayBox.width = 180;
    overlayBox.height = 120;
    formatActions.setSize(180, 120);

    await waitFor(() => {
      expect(geoIndicationsState.insetMap.dragPosition).toEqual({
        x: 96,
        y: 36
      });
    });
  });

  it('recenters the page when a centered geo indication loses focus', async () => {
    geoIndicationsActions.toggleScale();

    const { scale } = setupGeoViewport();

    await fireEvent.click(scale);

    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 90, y: 30 });
    });

    await fireEvent.blur(scale);

    await waitFor(() => {
      expect(globalState.zoom.pagePanOffset).toEqual({ x: 0, y: 0 });
    });
  });

  it('centers a newly added scale indication in the viewport', async () => {
    const { viewport } = setupEmptyGeoViewport();
    const originalGetBoundingClientRect =
      HTMLElement.prototype.getBoundingClientRect;

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: function mockGetBoundingClientRect() {
        if (this === viewport) {
          return createDomRect(0, 0, 300, 200);
        }

        if (
          this instanceof HTMLElement &&
          this.classList.contains('scale-bar')
        ) {
          return createDomRect(24, 130, 60, 26);
        }

        return createDomRect(0, 0, 0, 0);
      }
    });

    try {
      geoIndicationsActions.toggleScale();

      await waitFor(() => {
        expect(globalState.zoom.pagePanOffset).toEqual({ x: 96, y: -43 });
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: originalGetBoundingClientRect
      });
    }
  });

  it('centers a newly added orientation indication in the viewport', async () => {
    const { viewport } = setupEmptyGeoViewport();
    const originalGetBoundingClientRect =
      HTMLElement.prototype.getBoundingClientRect;

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: function mockGetBoundingClientRect() {
        if (this === viewport) {
          return createDomRect(0, 0, 300, 200);
        }

        if (
          this instanceof HTMLElement &&
          this.classList.contains('north-arrow')
        ) {
          return createDomRect(220, 18, 30, 40);
        }

        return createDomRect(0, 0, 0, 0);
      }
    });

    try {
      geoIndicationsActions.toggleOrientation();

      await waitFor(() => {
        expect(globalState.zoom.pagePanOffset).toEqual({ x: -85, y: 62 });
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: originalGetBoundingClientRect
      });
    }
  });
});
