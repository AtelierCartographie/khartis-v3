import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { exportMapToJpg, exportMapToSvg } from './map-export.utils';

const htmlToImage = vi.hoisted(() => ({
  toCanvas: vi.fn()
}));

vi.mock('html-to-image', () => ({
  toCanvas: htmlToImage.toCanvas
}));

const source = readFileSync(
  resolve(import.meta.dirname, 'map-export.utils.ts'),
  'utf8'
);

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
  element: Element,
  box: { left: number; top: number; width: number; height: number }
): void {
  if (element instanceof HTMLElement) {
    Object.defineProperty(element, 'offsetWidth', {
      configurable: true,
      get: () => box.width
    });
    Object.defineProperty(element, 'offsetHeight', {
      configurable: true,
      get: () => box.height
    });
  }

  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => createDomRect(box.left, box.top, box.width, box.height)
  });
}

function createExportCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  return canvas;
}

function stubImageDecode(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    'decode'
  );

  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined)
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(HTMLImageElement.prototype, 'decode', descriptor);
      return;
    }

    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  };
}

describe('map export DOM mutations', () => {
  beforeEach(() => {
    htmlToImage.toCanvas.mockReset();
    htmlToImage.toCanvas.mockResolvedValue(createExportCanvas(3840, 2160));

    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback): number => {
        callback(0);
        return 0;
      }
    );
  });

  afterEach(() => {
    document.body.innerHTML = '';
    mapInstanceStore.reset();
    vi.unstubAllGlobals();
  });

  it('keeps the export cleanup focused on debug-only UI without injecting an extra credit watermark', () => {
    expect(source).toContain("domNode.classList?.contains('page-grid')");
    expect(source).not.toContain('pageContainer.appendChild(sig)');
    expect(source).not.toContain('m.map_export_signature()');
  });

  it('builds SVG exports as structured layers instead of a single html snapshot', () => {
    expect(source).toContain('function buildStructuredSvgMarkup');
    expect(source).toContain('id="khartis-layer-page"');
    expect(source).toContain('id="khartis-layer-visualizations"');
    expect(source).toContain('id="khartis-layer-legend"');
    expect(source).toContain('id="khartis-layer-geo-indications"');
    expect(source).toContain('id="khartis-layer-annotations"');
    expect(source).not.toContain('toSvg as htmlToImageSvg');
  });

  it('waits for embedded fonts before exporting the page', () => {
    expect(source).toContain('await fontAssetsStore.ensureLoaded();');
  });

  it.each([
    ['Full HD', 1920, 1080, 2],
    ['2K QHD', 2560, 1440, 2560 / 960],
    ['4K UHD', 3840, 2160, 4]
  ])(
    'temporarily supersamples standalone Deck exports to the requested %s JPEG resolution',
    async (_label, width, height, expectedPixelRatio) => {
      document.body.innerHTML = `<div class="page-container"></div>`;
      const page = document.querySelector('.page-container');
      if (!page) {
        throw new Error('Missing export fixture node');
      }

      bindElementBox(page, { left: 0, top: 0, width: 960, height: 540 });

      const deck = {
        props: { useDevicePixels: 1 },
        setProps: vi.fn(),
        redraw: vi.fn()
      };
      mapInstanceStore.setDeckInstance(deck as never);
      mapInstanceStore.setMapLoaded(true);

      await exportMapToJpg({ width, height });

      expect(deck.setProps).toHaveBeenNthCalledWith(1, {
        useDevicePixels: expectedPixelRatio
      });
      expect(deck.redraw).toHaveBeenCalledWith('exportPixelRatio');
      expect(htmlToImage.toCanvas).toHaveBeenCalledWith(
        page,
        expect.objectContaining({
          pixelRatio: expectedPixelRatio,
          backgroundColor: '#ffffff'
        })
      );
      expect(deck.setProps).toHaveBeenNthCalledWith(2, {
        useDevicePixels: 1
      });
      expect(deck.redraw).toHaveBeenCalledWith('restoreExportPixelRatio');
    }
  );

  it('keeps standalone Deck exports at the current ratio when it already exceeds the target resolution', async () => {
    document.body.innerHTML = `<div class="page-container"></div>`;
    const page = document.querySelector('.page-container');
    if (!page) {
      throw new Error('Missing export fixture node');
    }

    bindElementBox(page, { left: 0, top: 0, width: 960, height: 540 });

    const deck = {
      props: { useDevicePixels: 2 },
      setProps: vi.fn(),
      redraw: vi.fn()
    };
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    await exportMapToJpg({ width: 1920, height: 1080 });

    expect(htmlToImage.toCanvas).toHaveBeenCalledWith(
      page,
      expect.objectContaining({
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      })
    );
    expect(deck.setProps).not.toHaveBeenCalled();
  });

  it('temporarily supersamples MapLibre interleaved exports instead of keeping the live canvas ratio', async () => {
    document.body.innerHTML = `<div class="page-container"></div>`;
    const page = document.querySelector('.page-container');
    if (!page) {
      throw new Error('Missing export fixture node');
    }

    bindElementBox(page, { left: 0, top: 0, width: 960, height: 540 });

    const map = {
      getPixelRatio: vi.fn(() => 1.5),
      setPixelRatio: vi.fn(),
      triggerRepaint: vi.fn(),
      once: vi.fn((_event: string, callback: () => void) => {
        callback();
      }),
      getMaxZoom: vi.fn(() => 22),
      setMaxZoom: vi.fn(),
      setMinZoom: vi.fn(),
      getZoom: vi.fn(() => 1)
    };
    mapInstanceStore.setMapInstance(map as never);
    mapInstanceStore.setDeckOverlay({} as never);
    mapInstanceStore.setMapLoaded(true);

    await exportMapToJpg({ width: 3840, height: 2160 });

    expect(map.setPixelRatio).toHaveBeenNthCalledWith(1, 4);
    expect(htmlToImage.toCanvas).toHaveBeenCalledWith(
      page,
      expect.objectContaining({ pixelRatio: 4 })
    );
    expect(map.setPixelRatio).toHaveBeenNthCalledWith(2, 1.5);
  });

  it('freezes WebGL canvases as images while html-to-image captures JPEG exports', async () => {
    const restoreImageDecode = stubImageDecode();
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas" style="position: relative;">
          <canvas></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const mapCanvas = document.querySelector('.map-canvas');
    const canvas = document.querySelector('canvas');
    if (!page || !mapCanvas || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 960, height: 540 });
    bindElementBox(mapCanvas, { left: 12, top: 18, width: 640, height: 360 });
    bindElementBox(canvas, { left: 12, top: 18, width: 640, height: 360 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    htmlToImage.toCanvas.mockImplementation(async () => {
      const frozenCanvas = page.querySelector(
        'img[data-khartis-export-frozen-canvas="true"]'
      ) as HTMLImageElement | null;

      expect(canvas.style.visibility).toBe('hidden');
      expect(frozenCanvas?.src).toBe('data:image/png;base64,AAAA');

      return createExportCanvas(1920, 1080);
    });

    try {
      await exportMapToJpg({ width: 1920, height: 1080 });
    } finally {
      restoreImageDecode();
    }

    expect(canvas.style.visibility).toBe('');
    expect(
      page.querySelector('img[data-khartis-export-frozen-canvas="true"]')
    ).toBeNull();
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('exports the shared facets WebGL canvas when a map collection is active', () => {
    expect(source).toContain('function resolveMapCanvas');
    expect(source).toContain('.shared-facets-canvas canvas');
  });

  it('serializes geo indications with their visible text and background colors', async () => {
    document.body.innerHTML = `
      <div class="page-container" style="background-color: rgb(255, 255, 255);">
        <div class="geo-indications-overlay">
          <div class="scale-bar" style="background-color: rgb(0, 0, 0); border-radius: 3px;">
            <svg width="80" height="26">
              <text x="40" y="10" fill="rgb(255, 255, 255)" font-size="12">200 km</text>
            </svg>
          </div>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const scale = document.querySelector('.scale-bar');
    const svg = document.querySelector('.scale-bar svg');
    if (!page || !scale || !svg) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(scale, { left: 24, top: 232, width: 90, height: 32 });
    bindElementBox(svg, { left: 29, top: 235, width: 80, height: 26 });

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('id="khartis-layer-geo-indications"');
    expect(markup).toContain('fill="rgb(0, 0, 0)"');
    expect(markup).toContain('200 km');
    expect(markup).toContain('fill="rgb(255, 255, 255)"');
  });
});

class FakeOffscreenCanvas {
  readonly width: number;

  readonly height: number;

  readonly context = {
    fillStyle: '',
    fillRect: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    drawImage: vi.fn()
  };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(type: string): typeof this.context | null {
    return type === '2d' ? this.context : null;
  }

  async convertToBlob(options: BlobPropertyBag): Promise<Blob> {
    return new Blob(['jpeg'], options);
  }
}
