import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import {
  SHAPE_ORDINAL,
  ShapeType,
  SLIDER_LIMITS
} from '$lib/features/commons/constants/visualization.constants';
import {
  globalActions,
  globalState
} from '$lib/features/commons/stores/global.svelte';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { ToolbarStep } from '$lib/features/commons/types/global';
import { exportMapToJpg, exportMapToSvg } from './map-export.utils';

const htmlToImage = vi.hoisted(() => ({
  toCanvas: vi.fn()
}));

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn()
}));

const globalStore = vi.hoisted(() => {
  const state = {
    selectedStep: 'data',
    isMapExporting: false
  };

  return {
    state,
    globalActions: {
      setNavigationState: vi.fn((step: string) => {
        state.selectedStep = step;
      }),
      resetNavigationState: vi.fn(() => {
        state.selectedStep = 'data';
        state.isMapExporting = false;
      }),
      setMapExporting: vi.fn((value: boolean) => {
        state.isMapExporting = value;
      })
    },
    globalState: {
      get selectedStep() {
        return state.selectedStep;
      },
      get isMapExporting() {
        return state.isMapExporting;
      }
    }
  };
});

vi.mock('html-to-image', () => ({
  toCanvas: htmlToImage.toCanvas
}));

vi.mock('$lib/features/commons/stores/global.svelte', () => ({
  globalActions: globalStore.globalActions,
  globalState: globalStore.globalState
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: { EXPORT: 'EXPORT' },
  logger: {
    warn: loggerMock.warn,
    error: loggerMock.error
  }
}));

vi.mock('@ateliercartographie/motif.js', () => ({
  motif: (config: { type: string; angle?: number }) => ({
    defs: {
      outerHTML: `<defs><pattern id="mock-pattern-${config.type}-${config.angle ?? 0}"></pattern></defs>`
    },
    url: `url(#mock-pattern-${config.type}-${config.angle ?? 0})`
  })
}));

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

function createDeckExportFixture(
  layers: unknown[],
  project: (position: number[]) => number[] = ([x, y]) => [x, y]
) {
  return {
    props: { useDevicePixels: 1 },
    setProps: vi.fn(),
    redraw: vi.fn(),
    getViewports: vi.fn(() => [{ project }]),
    layerManager: {
      getLayers: vi.fn(() => layers)
    }
  };
}

function createDeckLayer(
  layerName: string,
  id: string,
  props: Record<string, unknown>
): unknown {
  return {
    id,
    constructor: { layerName },
    props: { id, ...props }
  };
}

describe('map export DOM mutations', () => {
  beforeEach(() => {
    htmlToImage.toCanvas.mockReset();
    htmlToImage.toCanvas.mockResolvedValue(createExportCanvas(3840, 2160));
    globalStore.state.selectedStep = ToolbarStep.Data;
    globalStore.state.isMapExporting = false;
    globalStore.globalActions.setMapExporting.mockClear();
    globalStore.globalActions.setNavigationState.mockClear();
    globalStore.globalActions.resetNavigationState.mockClear();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();

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

  it('exports the full page bounds, page color, and map frame background around SVG map content', async () => {
    document.body.innerHTML = `
      <div class="page-container" style="background-color: rgb(250, 250, 250); padding: 30px 40px 50px 20px;">
        <div class="map-stage">
          <div class="map-canvas" style="background-color: rgb(200, 210, 220);">
            <canvas></canvas>
          </div>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const mapStage = document.querySelector('.map-stage');
    const mapCanvas = document.querySelector('.map-canvas');
    const canvas = document.querySelector('canvas');
    if (!page || !mapStage || !mapCanvas || !canvas) {
      throw new Error('Missing page geometry export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 320, height: 230 });
    bindElementBox(mapStage, { left: 20, top: 30, width: 300, height: 200 });
    bindElementBox(mapCanvas, { left: 20, top: 30, width: 300, height: 200 });
    bindElementBox(canvas, { left: 20, top: 30, width: 300, height: 200 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const blob = await exportMapToSvg({ width: 720, height: 560 });
    const markup = await blob.text();

    expect(markup).toContain('width="720"');
    expect(markup).toContain('height="560"');
    expect(markup).toContain('viewBox="0 0 360 280"');
    expect(markup).toContain('<clipPath id="khartis-map-frame-clip">');
    expect(markup).toContain('id="khartis-page-background"');
    expect(markup).toContain('width="360"');
    expect(markup).toContain('height="280"');
    expect(markup).toContain('fill="rgb(250, 250, 250)"');
    expect(markup).toContain('id="khartis-map-frame-background"');
    expect(markup).toContain('x="20"');
    expect(markup).toContain('y="30"');
    expect(markup).toContain('width="300"');
    expect(markup).toContain('height="200"');
    expect(markup).toContain('fill="rgb(200, 210, 220)"');
    expect(markup).toContain('clip-path="url(#khartis-map-frame-clip)"');
    expect(markup).toContain('data-khartis-export-mode="raster-fallback"');
  });

  it('exports layout text as native SVG text instead of a foreignObject fallback', async () => {
    document.body.innerHTML = `
      <div class="page-container" style="background: white;">
        <div class="annotation-overlay">
          <div class="annotation-item" data-annotation-role="title">
            <div
              class="annotation-text"
              style="color: rgb(1, 2, 3); font-family: Arial; font-size: 14px; font-weight: 700; line-height: 18px; text-align: center;"
            >Native title</div>
          </div>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const item = document.querySelector('.annotation-item');
    const text = document.querySelector('.annotation-text');
    if (!page || !item || !text) {
      throw new Error('Missing text export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(item, { left: 40, top: 50, width: 200, height: 30 });
    bindElementBox(text, { left: 40, top: 50, width: 200, height: 30 });

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain(`id="${m.svg_export_layer_annotations()}"`);
    expect(markup).toContain('inkscape:groupmode="layer"');
    expect(markup).toContain(
      `inkscape:label="${m.svg_export_layer_annotations()}"`
    );
    expect(markup).toContain(`id="${m.svg_export_role_title()}"`);
    expect(markup).toContain(`data-name="${m.svg_export_role_title()}"`);
    expect(markup).toContain('<text');
    expect(markup).toContain('Native title');
    expect(markup).toContain('text-anchor="middle"');
    expect(markup).not.toContain('<foreignObject');
  });

  it('omits empty page element placeholders from annotation export', async () => {
    document.body.innerHTML = `
      <div class="page-container" style="background: white;">
        <div class="annotation-overlay">
          <div
            class="annotation-item"
            data-annotation-role="title"
            data-khartis-export-placeholder="true"
          >
            <div
              class="annotation-text"
              style="color: rgb(1, 2, 3); font-family: Arial; font-size: 14px; line-height: 18px;"
            >Ajouter un titre</div>
          </div>
          <div class="annotation-item">
            <div
              class="annotation-text"
              style="color: rgb(4, 5, 6); font-family: Arial; font-size: 14px; line-height: 18px;"
            >User annotation</div>
          </div>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const placeholder = document.querySelector(
      '.annotation-item[data-annotation-role="title"]'
    );
    const placeholderText = placeholder?.querySelector('.annotation-text');
    const userAnnotation = document.querySelector(
      '.annotation-item:not([data-annotation-role])'
    );
    const userAnnotationText =
      userAnnotation?.querySelector('.annotation-text');
    if (
      !page ||
      !placeholder ||
      !placeholderText ||
      !userAnnotation ||
      !userAnnotationText
    ) {
      throw new Error('Missing annotation export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(placeholder, { left: 20, top: 24, width: 140, height: 24 });
    bindElementBox(placeholderText, {
      left: 20,
      top: 24,
      width: 140,
      height: 24
    });
    bindElementBox(userAnnotation, {
      left: 120,
      top: 140,
      width: 180,
      height: 30
    });
    bindElementBox(userAnnotationText, {
      left: 120,
      top: 140,
      width: 180,
      height: 30
    });

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('id="khartis-layer-annotations"');
    expect(markup).not.toContain('Ajouter un titre');
    expect(markup).not.toContain('id="khartis-annotation-title-1"');
    expect(markup).toContain('User annotation');
  });

  it('exports MapLibre interleaved Deck point layers as editable SVG primitives', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas">
          <canvas></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 10, top: 20, width: 200, height: 120 });
    const toDataUrl = vi
      .spyOn(canvas, 'toDataURL')
      .mockReturnValue('data:image/png;base64,AAAA');

    const layer = createDeckLayer('ScatterplotLayer', 'editable-symbols', {
      data: {
        length: 2,
        attributes: {
          getPosition: {
            value: new Float32Array([3, 4, 8, 10]),
            size: 2
          },
          getFillColor: {
            value: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]),
            size: 4
          },
          getRadius: {
            value: new Float32Array([6, 4]),
            size: 1
          }
        }
      },
      filled: true,
      stroked: false,
      barWidth: 8
    });
    const deck = createDeckExportFixture([layer], ([x, y]) => [x * 2, y * 2]);
    const map = {
      __deck: deck,
      getCanvas: vi.fn(() => canvas),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      getMaxZoom: vi.fn(() => 22),
      setMaxZoom: vi.fn(),
      setMinZoom: vi.fn(),
      getZoom: vi.fn(() => 1),
      setZoom: vi.fn()
    };
    mapInstanceStore.setMapInstance(map as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('data-khartis-layer-id="editable-symbols"');
    expect(markup).toContain('data-khartis-layer-type="ScatterplotLayer"');
    expect(markup).toContain('<circle');
    expect(markup).toContain('cx="16"');
    expect(markup).toContain('cy="28"');
    expect(markup).toContain('fill="rgb(255, 0, 0)"');
    expect(markup).toContain('fill-opacity="1"');
    expect(markup).toContain('fill-opacity="0.502"');
    expect(markup).not.toContain('data-khartis-export-mode="raster-fallback"');
    expect(toDataUrl).not.toHaveBeenCalled();
  });

  it('keeps MapLibre basemaps as a background image while exporting Deck visualizations as vectors', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas">
          <canvas></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    const toDataUrl = vi
      .spyOn(canvas, 'toDataURL')
      .mockReturnValue('data:image/png;base64,BASEMAP');

    const layer = createDeckLayer('ScatterplotLayer', 'osm-symbols', {
      data: {
        length: 1,
        attributes: {
          getPosition: {
            value: new Float32Array([12, 24]),
            size: 2
          },
          getFillColor: {
            value: new Uint8Array([255, 0, 0, 255]),
            size: 4
          },
          getRadius: {
            value: new Float32Array([5]),
            size: 1
          }
        }
      },
      filled: true,
      stroked: false,
      barWidth: 8
    });
    const deck = createDeckExportFixture([layer]);
    const map = {
      __deck: deck,
      getCanvas: vi.fn(() => canvas),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      triggerRepaint: vi.fn(),
      once: vi.fn((_event: string, callback: () => void) => callback()),
      getMaxZoom: vi.fn(() => 22),
      setMaxZoom: vi.fn(),
      setMinZoom: vi.fn(),
      getZoom: vi.fn(() => 1),
      setZoom: vi.fn()
    };
    mapInstanceStore.setMapInstance(map as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(deck.setProps).toHaveBeenNthCalledWith(1, { layers: [] });
    expect(deck.setProps).toHaveBeenNthCalledWith(2, { layers: [layer] });
    expect(toDataUrl).toHaveBeenCalledWith('image/png');
    expect(markup).toContain('data-khartis-export-mode="maplibre-background"');
    expect(markup).toContain('href="data:image/png;base64,BASEMAP"');
    expect(markup).toContain('data-khartis-layer-id="osm-symbols"');
    expect(markup).toContain('<circle');
    expect(markup).not.toContain('data-khartis-export-mode="raster-fallback"');
  });

  it('logs and keeps SVG export usable when MapLibre background capture fails', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas">
          <canvas width="400" height="300"></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    const captureError = new Error('capture failed');
    vi.spyOn(canvas, 'toDataURL').mockImplementation(() => {
      throw captureError;
    });

    const layer = createDeckLayer('ScatterplotLayer', 'osm-symbols', {
      data: {
        length: 1,
        attributes: {
          getPosition: {
            value: new Float32Array([12, 24]),
            size: 2
          },
          getFillColor: {
            value: new Uint8Array([255, 0, 0, 255]),
            size: 4
          },
          getRadius: {
            value: new Float32Array([5]),
            size: 1
          }
        }
      },
      filled: true,
      stroked: false
    });
    const deck = createDeckExportFixture([layer]);
    const map = {
      __deck: deck,
      getCanvas: vi.fn(() => canvas),
      getPixelRatio: vi.fn(() => 1),
      setPixelRatio: vi.fn(),
      triggerRepaint: vi.fn(),
      once: vi.fn((_event: string, callback: () => void) => callback()),
      getMaxZoom: vi.fn(() => 22),
      setMaxZoom: vi.fn(),
      setMinZoom: vi.fn(),
      getZoom: vi.fn(() => 1),
      setZoom: vi.fn()
    };
    mapInstanceStore.setMapInstance(map as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('data-khartis-layer-id="osm-symbols"');
    expect(markup).toContain('<circle');
    expect(markup).not.toContain(
      'data-khartis-export-mode="maplibre-background"'
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Failed to capture MapLibre background for SVG export',
      'EXPORT',
      expect.objectContaining({
        error: captureError,
        flow: 'svg_export_maplibre_background',
        extra: expect.objectContaining({
          layerCount: 1,
          canvasWidth: 400,
          canvasHeight: 300
        })
      })
    );
  });

  it('exports Deck line and polygon layers as SVG paths', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas">
          <canvas></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const lineLayer = createDeckLayer('PathLayer', 'editable-lines', {
      data: {
        length: 1,
        startIndices: new Uint32Array([0, 3]),
        attributes: {
          getPath: {
            value: new Float32Array([0, 0, 10, 0, 10, 10]),
            size: 2
          },
          getColor: {
            value: new Uint8Array([0, 0, 0, 255]),
            size: 4
          },
          getWidth: {
            value: new Float32Array([2]),
            size: 1
          }
        }
      }
    });
    const polygonLayer = createDeckLayer(
      'SolidPolygonLayer',
      'editable-areas',
      {
        data: {
          length: 1,
          startIndices: new Uint32Array([0, 4]),
          attributes: {
            getPolygon: {
              value: new Float32Array([20, 20, 60, 20, 60, 50, 20, 50]),
              size: 2
            },
            getFillColor: {
              value: new Uint8Array([10, 20, 30, 255]),
              size: 4
            }
          }
        }
      }
    );
    const deck = createDeckExportFixture([polygonLayer, lineLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('data-khartis-layer-id="editable-areas"');
    expect(markup).toContain('data-khartis-layer-id="editable-lines"');
    expect(markup).toContain('fill-rule="evenodd"');
    expect(markup).toContain('fill="rgb(10, 20, 30)"');
    expect(markup).toContain('stroke-width="2"');
    expect(markup).toContain('M 20 20 L 60 20 L 60 50 L 20 50 Z');
    expect(markup).toContain('M 0 0 L 10 0 L 10 10');
    expect(markup).not.toContain('data-khartis-export-mode="raster-fallback"');
  });

  it('reads per-vertex SolidPolygonLayer fill colors at each polygon first vertex', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas">
          <canvas></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const polygonLayer = createDeckLayer(
      'SolidPolygonLayer',
      'choropleth-areas',
      {
        data: {
          length: 2,
          startIndices: new Uint32Array([0, 4, 8]),
          attributes: {
            getPolygon: {
              value: new Float32Array([
                0, 0, 10, 0, 10, 10, 0, 10, 20, 0, 30, 0, 30, 10, 20, 10
              ]),
              size: 2
            },
            getFillColor: {
              value: new Uint8Array([
                255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
                0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255
              ]),
              size: 4
            }
          }
        }
      }
    );
    const deck = createDeckExportFixture([polygonLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('fill="rgb(255, 0, 0)"');
    expect(markup).toContain('fill="rgb(0, 0, 255)"');
  });

  it('reads per-vertex PathLayer color and width at each path first vertex', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas">
          <canvas></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const lineLayer = createDeckLayer('PathLayer', 'two-color-lines', {
      data: {
        length: 2,
        startIndices: new Uint32Array([0, 2, 4]),
        attributes: {
          getPath: {
            value: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0]),
            size: 2
          },
          getColor: {
            value: new Uint8Array([
              255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255
            ]),
            size: 4
          },
          getWidth: {
            value: new Float32Array([2, 2, 6, 6]),
            size: 1
          }
        }
      }
    });
    const deck = createDeckExportFixture([lineLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('stroke="rgb(255, 0, 0)"');
    expect(markup).toContain('stroke-width="2"');
    expect(markup).toContain('stroke="rgb(0, 0, 255)"');
    expect(markup).toContain('stroke-width="6"');
  });

  it('exports Deck text layers as native SVG text elements', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas">
          <canvas></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const textLayer = createDeckLayer('TextLayer', 'editable-texts', {
      data: [
        { position: [10, 20], text: 'Paris' },
        { position: [30, 40], text: 'Lyon' }
      ],
      getPosition: (d: { position: number[] }) => d.position,
      getText: (d: { text: string }) => d.text,
      getColor: () => [0, 0, 0, 255],
      getSize: () => 14,
      sizeUnits: 'pixels',
      fontFamily: 'Arial',
      fontWeight: '400',
      background: false,
      billboard: true,
      pickable: false,
      visible: true,
      opacity: 1
    });
    const deck = createDeckExportFixture([textLayer], ([x, y]) => [
      x * 2,
      y * 2
    ]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('data-khartis-layer-id="editable-texts"');
    expect(markup).toContain('data-khartis-layer-type="TextLayer"');
    expect(markup).toContain('<text');
    expect(markup).toContain('<tspan x="20" dy="0">Paris</tspan>');
    expect(markup).toContain('<tspan x="60" dy="0">Lyon</tspan>');
    expect(markup).toContain('font-family="Arial"');
    expect(markup).toContain('font-size="14"');
    expect(markup).toContain('x="20"');
    expect(markup).toContain('y="44.9"');
    expect(markup).toContain('x="60"');
    expect(markup).toContain('y="84.9"');
    expect(markup).not.toContain('dominant-baseline');
    expect(markup).not.toContain('line-height="1');
    expect(markup.match(/<text/g)?.length).toBe(2);
  });

  it('doubles the exported font-size when sizeScale is applied', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const textLayer = createDeckLayer('TextLayer', 'scaled-texts', {
      data: [{ position: [10, 20], text: 'Paris' }],
      getPosition: (d: { position: number[] }) => d.position,
      getText: (d: { text: string }) => d.text,
      getColor: () => [0, 0, 0, 255],
      getSize: () => 14,
      sizeUnits: 'pixels',
      sizeScale: 2,
      fontFamily: 'Arial',
      fontWeight: '400',
      background: false
    });
    const deck = createDeckExportFixture([textLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('font-size="28"');
  });

  it('splits text containing a newline into two tspans with correct dy', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const textLayer = createDeckLayer('TextLayer', 'multiline-text', {
      data: [{ position: [10, 20], text: 'Paris\nFrance' }],
      getPosition: (d: { position: number[] }) => d.position,
      getText: (d: { text: string }) => d.text,
      getColor: () => [0, 0, 0, 255],
      getSize: () => 10,
      sizeUnits: 'pixels',
      lineHeight: 1.15,
      fontFamily: 'Arial',
      fontWeight: '400',
      background: false
    });
    const deck = createDeckExportFixture([textLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('<tspan x="10" dy="0">Paris</tspan>');
    expect(markup).toContain('<tspan x="10" dy="11.5">France</tspan>');
    expect(markup.match(/<text/g)?.length).toBe(1);
  });

  it('wraps long text exceeding maxWidth into multiple tspans using the fallback measurement', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const textLayer = createDeckLayer('TextLayer', 'wrapped-text', {
      data: [{ position: [10, 20], text: 'a long label that wraps' }],
      getPosition: (d: { position: number[] }) => d.position,
      getText: (d: { text: string }) => d.text,
      getColor: () => [0, 0, 0, 255],
      getSize: () => 10,
      sizeUnits: 'pixels',
      maxWidth: 10,
      fontFamily: 'Arial',
      fontWeight: '400',
      background: false
    });
    const deck = createDeckExportFixture([textLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    const tspanCount = markup.match(/<tspan/g)?.length ?? 0;
    expect(tspanCount).toBeGreaterThan(1);
    expect(markup.match(/<text/g)?.length).toBe(1);
  });

  it('renders a separate halo text element before the fill text with the inverse outline width', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const maxHaloWidth = SLIDER_LIMITS.haloWidth.max;
    const outlineWidth = 0.35;
    const expectedHaloPx = maxHaloWidth * (outlineWidth / 0.5) ** 2;

    const textLayer = createDeckLayer('TextLayer', 'halo-text', {
      data: [{ position: [10, 20], text: 'Paris' }],
      getPosition: (d: { position: number[] }) => d.position,
      getText: (d: { text: string }) => d.text,
      getColor: () => [0, 0, 0, 255],
      getSize: () => 14,
      sizeUnits: 'pixels',
      outlineWidth,
      outlineColor: [255, 255, 255, 255],
      fontFamily: 'Arial',
      fontWeight: '400',
      background: false
    });
    const deck = createDeckExportFixture([textLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    const textElements = markup.match(/<text[\s\S]*?<\/text>/g) ?? [];
    expect(textElements).toHaveLength(2);
    expect(textElements[0]).toContain(
      `stroke-width="${Number((2 * expectedHaloPx).toFixed(3))}"`
    );
    expect(textElements[0]).toContain('stroke="rgb(255, 255, 255)"');
    expect(textElements[0]).toContain('stroke-linejoin="round"');
    expect(textElements[1]).toContain('stroke="none"');
    expect(markup).not.toContain('paint-order');
    expect(markup).not.toContain('dominant-baseline');
  });

  it('renders BAR and SPIKE shapes with the configured barWidth', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const layer = createDeckLayer('MultiShapeLayer', 'shapes', {
      data: {
        length: 2,
        attributes: {
          getPosition: {
            value: new Float32Array([10, 10, 30, 30]),
            size: 2
          },
          getFillColor: {
            value: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
            size: 4
          },
          getRadius: {
            value: new Float32Array([10, 10]),
            size: 1
          },
          getShape: {
            value: new Float32Array([2, 3]),
            size: 1
          }
        }
      },
      barWidth: 8,
      filled: true,
      stroked: false
    });
    const deck = createDeckExportFixture([layer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('<rect x="6" y="-10"');
    expect(markup).toContain('width="8"');
    expect(markup).toContain('height="20"');
    expect(markup).toMatch(/<path d="M 24 30 L 30 10 L 36 30 Z"/);
  });

  it('exports every MultiShapeLayer symbol shape as vector SVG primitives', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const exportedShapes = [
      ShapeType.CIRCLE,
      ShapeType.SQUARE,
      ShapeType.BAR,
      ShapeType.SPIKE,
      ShapeType.CROSS,
      ShapeType.DIAMOND,
      ShapeType.TRIANGLE,
      ShapeType.STAR,
      ShapeType.RECTANGLE
    ];

    const layer = createDeckLayer('MultiShapeLayer', 'editable-symbol-shapes', {
      data: {
        length: exportedShapes.length,
        attributes: {
          getPosition: {
            value: new Float32Array(
              exportedShapes.flatMap((_, index) => [10 + index * 25, 10])
            ),
            size: 2
          },
          getFillColor: {
            value: new Uint8Array(
              exportedShapes.flatMap(() => [255, 0, 0, 255])
            ),
            size: 4
          },
          getRadius: {
            value: new Float32Array(exportedShapes.map(() => 10)),
            size: 1
          },
          getShape: {
            value: new Float32Array(
              exportedShapes.map((shape) => SHAPE_ORDINAL[shape])
            ),
            size: 1
          }
        }
      },
      filled: true,
      stroked: false,
      barWidth: 8
    });
    const deck = createDeckExportFixture([layer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('data-khartis-layer-id="editable-symbol-shapes"');
    expect(markup).toContain('data-khartis-layer-type="MultiShapeLayer"');
    expect(markup).toContain('<circle cx="10" cy="10" r="10"');
    expect(markup).toContain(
      '<rect x="26.43" y="1.43" width="17.14" height="17.14"'
    );
    expect(markup).toContain('<rect x="56" y="-10" width="8" height="20"');
    expect(markup).toContain('<path d="M 79 10 L 85 -10 L 91 10 Z"');
    expect(markup).toContain('<path d="M 106.67 0 L 113.33 0 L 113.33 6.67');
    expect(markup).toContain('<path d="M 135 0 L 145 10 L 135 20 L 125 10 Z"');
    expect(markup).toContain('<path d="M 160 0 L 170 20 L 150 20 Z"');
    expect(markup).toContain('<path d="M 185 0 L 187.2 7.8');
    expect(markup).toContain(
      '<rect x="197.14" y="6.14" width="25.71" height="7.71"'
    );
    expect(markup).not.toContain('data:image/svg+xml');
  });

  it('emits an SVG drop-shadow filter for the legend box-shadow', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
        <div
          class="legend-container"
          style="background-color: rgb(255, 255, 255); box-shadow: rgba(0, 0, 0, 0.15) 0px 2px 8px 0px;"
        ></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const legend = document.querySelector('.legend-container');
    const canvas = document.querySelector('canvas');
    if (!page || !legend || !canvas) {
      throw new Error('Missing legend fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(legend, { left: 20, top: 30, width: 120, height: 60 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toMatch(/id="khartis-drop-shadow-\d+"/);
    expect(markup).toContain('<feDropShadow');
    expect(markup).toContain('dx="0"');
    expect(markup).toContain('dy="2"');
    expect(markup).toContain('stdDeviation="4"');
    expect(markup).toContain('flood-color="rgb(0, 0, 0)"');
    expect(markup).toContain('flood-opacity="0.15"');
    expect(markup).toMatch(/filter="url\(#khartis-drop-shadow-\d+\)"/);
  });

  it('exports Deck pattern fill layers as native SVG patterns', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas">
          <canvas></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing pattern export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const patternLayer = createDeckLayer('GeoJsonLayer', 'areas-pattern', {
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [20, 20],
                  [60, 20],
                  [60, 50],
                  [20, 50],
                  [20, 20]
                ]
              ]
            }
          }
        ]
      },
      getFillColor: [0, 0, 0, 153],
      getLineColor: [0, 0, 0, 0],
      getLineWidth: 0,
      khartisPatternId: 'diagonal-reverse',
      khartisPatternSize: 9,
      khartisPatternScale: 16,
      khartisPatternAngle: 315
    });
    const deck = createDeckExportFixture([patternLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('id="mock-pattern-line-315"');
    expect(markup).toContain('fill="url(#mock-pattern-line-315)"');
    expect(markup).toContain('fill-opacity="0.6"');
    expect(markup).not.toContain('fill="rgb(0, 0, 0)"');
    expect(markup).not.toContain('data-khartis-export-mode="raster-fallback"');
  });

  it('preserves GeoJSON polygon fill and stroke modes in SVG exports', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas">
          <canvas></canvas>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing GeoJSON polygon export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const polygon = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [20, 20],
                [60, 20],
                [60, 50],
                [20, 50],
                [20, 20]
              ]
            ]
          }
        }
      ]
    };
    const outlineLayer = createDeckLayer('GeoJsonLayer', 'polygon-outline', {
      data: polygon,
      filled: false,
      stroked: true,
      getLineColor: [255, 0, 0, 255],
      getLineWidth: 2
    });
    const fillLayer = createDeckLayer('GeoJsonLayer', 'polygon-fill', {
      data: polygon,
      filled: true,
      stroked: false,
      getFillColor: [0, 0, 255, 255]
    });
    const deck = createDeckExportFixture([outlineLayer, fillLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();
    const outlineMarkup = markup.match(
      /<g[^>]+data-khartis-layer-id="polygon-outline"[\s\S]*?<\/g>/
    )?.[0];
    const fillMarkup = markup.match(
      /<g[^>]+data-khartis-layer-id="polygon-fill"[\s\S]*?<\/g>/
    )?.[0];

    expect(outlineMarkup).toContain('fill="none"');
    expect(outlineMarkup).toContain('stroke="rgb(255, 0, 0)"');
    expect(outlineMarkup).toContain('stroke-width="2"');
    expect(fillMarkup).toContain('fill="rgb(0, 0, 255)"');
    expect(fillMarkup).toContain('stroke="none"');
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

  it('skips the MapLibre pixel-ratio rescale in interleaved Deck.gl mode to preserve symbol projection', async () => {
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

    expect(map.setPixelRatio).not.toHaveBeenCalled();
    expect(htmlToImage.toCanvas).toHaveBeenCalledWith(
      page,
      expect.objectContaining({ pixelRatio: 4 })
    );
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

  it('hides empty page element placeholders while html-to-image captures JPEG exports', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div
          class="annotation-item"
          data-khartis-export-placeholder="true"
        >Ajouter un titre</div>
        <div class="annotation-item">User annotation</div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const placeholder = document.querySelector(
      '[data-khartis-export-placeholder="true"]'
    ) as HTMLElement | null;
    const userAnnotation = Array.from(
      document.querySelectorAll<HTMLElement>('.annotation-item')
    ).find((item) => item.textContent?.includes('User annotation'));
    if (!page || !placeholder || !userAnnotation) {
      throw new Error('Missing placeholder export fixture nodes');
    }

    placeholder.style.display = 'inline-block';
    bindElementBox(page, { left: 0, top: 0, width: 960, height: 540 });
    htmlToImage.toCanvas.mockImplementation(async () => {
      expect(placeholder.style.display).toBe('none');
      expect(userAnnotation.style.display).toBe('');

      return createExportCanvas(1920, 1080);
    });

    await exportMapToJpg({ width: 1920, height: 1080 });

    expect(placeholder.style.display).toBe('inline-block');
  });

  it('captures JPEG exports in layout export mode without changing the current step', async () => {
    globalActions.setNavigationState(ToolbarStep.Visualizations);
    document.body.innerHTML = `
      <div class="page-container">
        <div class="geo-indications-overlay hidden"></div>
        <div class="annotation-overlay hidden"></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    if (!page) {
      throw new Error('Missing export fixture node');
    }

    bindElementBox(page, { left: 0, top: 0, width: 960, height: 540 });
    htmlToImage.toCanvas.mockImplementation(async (node) => {
      expect(node).toBe(page);
      expect(globalState.selectedStep).toBe(ToolbarStep.Visualizations);
      expect(globalState.isMapExporting).toBe(true);
      expect(page.classList.contains('is-exporting-map')).toBe(true);

      return createExportCanvas(1920, 1080);
    });

    await exportMapToJpg({ width: 1920, height: 1080 });

    expect(globalState.selectedStep).toBe(ToolbarStep.Visualizations);
    expect(globalState.isMapExporting).toBe(false);
    expect(page.classList.contains('is-exporting-map')).toBe(false);
  });

  it('uses the facets page root for SVG and JPEG exports', async () => {
    const restoreImageDecode = stubImageDecode();
    document.body.innerHTML = `
      <div class="facets-page" style="background-color: rgb(245, 245, 245); padding: 10px 20px 30px 40px;">
        <div class="facets-map-stage">
          <div class="shared-facets-canvas" style="position: relative; background-color: rgb(210, 220, 230);">
            <canvas width="720" height="560"></canvas>
          </div>
        </div>
      </div>
    `;

    const page = document.querySelector('.facets-page');
    const mapStage = document.querySelector('.facets-map-stage');
    const sharedCanvas = document.querySelector('.shared-facets-canvas');
    const canvas = document.querySelector('canvas');
    if (!page || !mapStage || !sharedCanvas || !canvas) {
      throw new Error('Missing facets export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 420, height: 320 });
    bindElementBox(mapStage, { left: 40, top: 10, width: 360, height: 280 });
    bindElementBox(sharedCanvas, {
      left: 40,
      top: 10,
      width: 360,
      height: 280
    });
    bindElementBox(canvas, { left: 40, top: 10, width: 360, height: 280 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue(
      'data:image/png;base64,FACETS'
    );
    htmlToImage.toCanvas.mockImplementation(async (node) => {
      expect(node).toBe(page);
      return createExportCanvas(800, 600);
    });

    try {
      const blob = await exportMapToSvg({ width: 800, height: 600 });
      const markup = await blob.text();

      expect(markup).toContain('viewBox="0 0 420 320"');
      expect(markup).toContain('id="khartis-map-frame-background"');
      expect(markup).toContain('fill="rgb(210, 220, 230)"');
      expect(markup).toContain('clip-path="url(#khartis-map-frame-clip)"');
      expect(markup).toContain('data-khartis-export-mode="raster-fallback"');

      await exportMapToJpg({ width: 800, height: 600 });
    } finally {
      restoreImageDecode();
    }

    expect(htmlToImage.toCanvas).toHaveBeenCalledWith(
      page,
      expect.objectContaining({
        pixelRatio: 600 / 320,
        backgroundColor: '#ffffff'
      })
    );
  });

  it('serializes facet Deck viewports without collapsing maps into the first facet', async () => {
    document.body.innerHTML = `
      <div class="facets-page">
        <div class="facets-map-stage">
          <div class="shared-facets-canvas">
            <canvas></canvas>
          </div>
        </div>
      </div>
    `;

    const page = document.querySelector('.facets-page');
    const mapStage = document.querySelector('.facets-map-stage');
    const sharedCanvas = document.querySelector('.shared-facets-canvas');
    const canvas = document.querySelector('canvas');
    if (!page || !mapStage || !sharedCanvas || !canvas) {
      throw new Error('Missing facet viewport export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 220 });
    bindElementBox(mapStage, { left: 0, top: 0, width: 400, height: 200 });
    bindElementBox(sharedCanvas, { left: 0, top: 0, width: 400, height: 200 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 200 });
    const toDataUrl = vi
      .spyOn(canvas, 'toDataURL')
      .mockReturnValue('data:image/png;base64,FACETS');

    const firstLayer = createDeckLayer(
      'ScatterplotLayer',
      'facet-viz-a-symbols',
      {
        data: {
          length: 1,
          attributes: {
            getPosition: {
              value: new Float32Array([0, 0]),
              size: 2
            },
            getFillColor: {
              value: new Uint8Array([255, 0, 0, 255]),
              size: 4
            },
            getRadius: {
              value: new Float32Array([5]),
              size: 1
            }
          }
        },
        filled: true,
        stroked: false
      }
    );
    const secondLayer = createDeckLayer(
      'ScatterplotLayer',
      'facet-viz-b-symbols',
      {
        data: {
          length: 1,
          attributes: {
            getPosition: {
              value: new Float32Array([0, 0]),
              size: 2
            },
            getFillColor: {
              value: new Uint8Array([0, 0, 255, 255]),
              size: 4
            },
            getRadius: {
              value: new Float32Array([5]),
              size: 1
            }
          }
        },
        filled: true,
        stroked: false
      }
    );
    const viewports = [
      {
        id: 'facet-view-a',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        project: vi.fn(() => [50, 80])
      },
      {
        id: 'facet-view-b',
        x: 200,
        y: 0,
        width: 200,
        height: 200,
        project: vi.fn(() => [50, 80])
      }
    ];
    const deck = {
      props: {
        useDevicePixels: 1,
        layerFilter: vi.fn(({ layer, viewport }) => {
          const layerId = String(layer.id);
          if (layerId.includes('viz-a')) return viewport.id === 'facet-view-a';
          if (layerId.includes('viz-b')) return viewport.id === 'facet-view-b';
          return true;
        })
      },
      setProps: vi.fn(),
      redraw: vi.fn(),
      getViewports: vi.fn(() => viewports),
      layerManager: {
        getLayers: vi.fn(() => [firstLayer, secondLayer])
      }
    };
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 800, height: 440 });
    const markup = await blob.text();

    expect(markup).toContain('data-khartis-viewport-id="facet-view-a"');
    expect(markup).toContain('data-khartis-viewport-id="facet-view-b"');
    expect(markup).toContain(
      'clip-path="url(#khartis-deck-viewport-facet-view-a-clip)"'
    );
    expect(markup).toContain(
      'clip-path="url(#khartis-deck-viewport-facet-view-b-clip)"'
    );
    expect(markup).toContain('data-khartis-layer-id="facet-viz-a-symbols"');
    expect(markup).toContain('data-khartis-layer-id="facet-viz-b-symbols"');
    expect(markup).toContain('cx="50"');
    expect(markup).toContain('cx="250"');
    expect(markup).not.toContain('data-khartis-export-mode="raster-fallback"');
    expect(toDataUrl).not.toHaveBeenCalled();
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

    expect(markup).toContain(`id="${m.svg_export_layer_scale()}"`);
    expect(markup).toContain('inkscape:groupmode="layer"');
    expect(markup).toContain('fill="rgb(0, 0, 0)"');
    expect(markup).toContain('200 km');
    expect(markup).toContain('fill="rgb(255, 255, 255)"');
    expect(markup.match(/<svg[\s>]/g)).toHaveLength(1);
  });

  it('names top-level layers with localized ids and Inkscape layer metadata', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain(
      'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"'
    );
    expect(markup).toContain(`id="${m.svg_export_layer_page()}"`);
    expect(markup).toContain(`inkscape:label="${m.svg_export_layer_page()}"`);
    expect(markup).toContain(`data-name="${m.svg_export_layer_page()}"`);
    expect(markup).toContain(`id="${m.svg_export_layer_map()}"`);
    expect(markup).toContain(`inkscape:label="${m.svg_export_layer_map()}"`);
    expect(markup.match(/inkscape:groupmode="layer"/g)?.length).toBe(2);
  });

  it('dedupes duplicate annotation ids sharing the same role with numeric suffixes', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="annotation-overlay">
          <div class="annotation-item" data-annotation-role="note">
            <div class="annotation-text" style="font-family: Arial; font-size: 12px;">First note</div>
          </div>
          <div class="annotation-item" data-annotation-role="note">
            <div class="annotation-text" style="font-family: Arial; font-size: 12px;">Second note</div>
          </div>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const items = document.querySelectorAll('.annotation-item');
    const texts = document.querySelectorAll('.annotation-text');
    if (!page || items.length !== 2 || texts.length !== 2) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    items.forEach((item, index) =>
      bindElementBox(item, { left: 0, top: index * 40, width: 200, height: 30 })
    );
    texts.forEach((text, index) =>
      bindElementBox(text, { left: 0, top: index * 40, width: 200, height: 30 })
    );

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain(`id="${m.svg_export_role_note()}"`);
    expect(markup).toContain(`id="${m.svg_export_role_note()}-2"`);
    expect(markup).toContain('First note');
    expect(markup).toContain('Second note');
  });

  it('exports one named layer per legend frame', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="legend-container">
          <svg width="40" height="20" viewBox="0 0 40 20"></svg>
        </div>
        <div class="legend-container">
          <svg width="60" height="30" viewBox="0 0 60 30"></svg>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const frames = document.querySelectorAll('.legend-container');
    const svgs = document.querySelectorAll('.legend-container svg');
    if (!page || frames.length !== 2 || svgs.length !== 2) {
      throw new Error('Missing legend fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(frames[0], { left: 20, top: 30, width: 40, height: 20 });
    bindElementBox(svgs[0], { left: 20, top: 30, width: 40, height: 20 });
    bindElementBox(frames[1], { left: 200, top: 150, width: 60, height: 30 });
    bindElementBox(svgs[1], { left: 200, top: 150, width: 60, height: 30 });

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup).toContain('id="khartis-legend-segment-1"');
    expect(markup).toContain('id="khartis-legend-segment-2"');
    expect(markup).toContain('transform="translate(20, 30)"');
    expect(markup).toContain('transform="translate(200, 150)"');
  });

  it('converts nested SVG legend segments into scaled <g transform> groups', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="legend-container">
          <svg width="100" height="50" viewBox="0 0 50 25">
            <rect x="0" y="0" width="10" height="10" />
          </svg>
        </div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const legend = document.querySelector('.legend-container');
    const svg = document.querySelector('.legend-container svg');
    if (!page || !legend || !svg) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(legend, { left: 20, top: 30, width: 100, height: 50 });
    bindElementBox(svg, { left: 20, top: 30, width: 100, height: 50 });

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    expect(markup.match(/<svg[\s>]/g)).toHaveLength(1);
    expect(markup).toContain('id="khartis-legend-segment-1"');
    expect(markup).toContain('transform="translate(0, 0) scale(2, 2)"');
    expect(markup).toMatch(/<rect x="0" y="0" width="10" height="10"[^>]*\/?>/);
  });

  it('merges consecutive polygons sharing a featureId into one compound path named from the source table', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const names = ['France', 'Germany'];
    const khartisSourceTable = {
      numRows: 2,
      schema: { fields: [{ name: 'name' }] },
      getChild: (columnName: string) =>
        columnName === 'name' ? { get: (row: number) => names[row] } : undefined
    };

    const polygonLayer = createDeckLayer(
      'SolidPolygonLayer',
      'named-countries',
      {
        data: {
          length: 3,
          startIndices: new Uint32Array([0, 4, 8, 12]),
          featureIds: new Uint32Array([0, 0, 1]),
          khartisSourceTable,
          attributes: {
            getPolygon: {
              value: new Float32Array([
                0, 0, 10, 0, 10, 10, 0, 10, 20, 0, 30, 0, 30, 10, 20, 10, 40, 0,
                50, 0, 50, 10, 40, 10
              ]),
              size: 2
            },
            getFillColor: {
              value: new Uint8Array([
                255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
                255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
                0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255
              ]),
              size: 4
            }
          }
        }
      }
    );
    const deck = createDeckExportFixture([polygonLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    const pathCount = markup.match(/<path/g)?.length ?? 0;
    expect(pathCount).toBe(2);
    expect(markup).toContain('id="France"');
    expect(markup).toContain('data-name="France"');
    expect(markup).toContain('id="Germany"');
    expect(markup).toContain('data-name="Germany"');
    expect(markup).toContain(
      'M 0 0 L 10 0 L 10 10 L 0 10 Z M 20 0 L 30 0 L 30 10 L 20 10 Z'
    );
    expect(markup).toContain('fill="rgb(255, 0, 0)"');
    expect(markup).toContain('fill="rgb(0, 0, 255)"');
  });

  it('merges consecutive featureless polygons sharing the same fill into one compound path', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const polygonLayer = createDeckLayer('SolidPolygonLayer', 'basemap-land', {
      data: {
        length: 3,
        startIndices: new Uint32Array([0, 4, 8, 12]),
        attributes: {
          getPolygon: {
            value: new Float32Array([
              0, 0, 10, 0, 10, 10, 0, 10, 20, 0, 30, 0, 30, 10, 20, 10, 40, 0,
              50, 0, 50, 10, 40, 10
            ]),
            size: 2
          },
          getFillColor: {
            value: new Uint8Array([
              255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
              255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 0,
              0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255
            ]),
            size: 4
          }
        }
      }
    });
    const deck = createDeckExportFixture([polygonLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    const pathCount = markup.match(/<path/g)?.length ?? 0;
    expect(pathCount).toBe(2);
    expect(markup).toContain(
      'M 0 0 L 10 0 L 10 10 L 0 10 Z M 20 0 L 30 0 L 30 10 L 20 10 Z'
    );
    expect(markup).toContain('M 40 0 L 50 0 L 50 10 L 40 10 Z');
    expect(markup).toContain('fill="rgb(255, 0, 0)"');
    expect(markup).toContain('fill="rgb(0, 0, 255)"');
  });

  it('merges consecutive PathLayer segments sharing the same stroke style into one compound path', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const lineLayer = createDeckLayer('PathLayer', 'basemap-borders', {
      data: {
        length: 3,
        startIndices: new Uint32Array([0, 2, 4, 6]),
        attributes: {
          getPath: {
            value: new Float32Array([0, 0, 10, 0, 20, 0, 30, 0, 40, 0, 50, 0]),
            size: 2
          },
          getColor: {
            value: new Uint8Array([
              0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0,
              255, 0, 0, 0, 255
            ]),
            size: 4
          },
          getWidth: {
            value: new Float32Array([1, 1, 1, 1, 1, 1]),
            size: 1
          }
        }
      }
    });
    const deck = createDeckExportFixture([lineLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    const pathCount = markup.match(/<path/g)?.length ?? 0;
    expect(pathCount).toBe(1);
    expect(markup).toContain('M 0 0 L 10 0 M 20 0 L 30 0 M 40 0 L 50 0');
    expect(markup).toContain('stroke="rgb(0, 0, 0)"');
  });

  it('hoists shared font-family, font-size, text-anchor and fill onto the text layer group', async () => {
    document.body.innerHTML = `
      <div class="page-container">
        <div class="map-canvas"><canvas></canvas></div>
      </div>
    `;

    const page = document.querySelector('.page-container');
    const canvas = document.querySelector('canvas');
    if (!page || !canvas) {
      throw new Error('Missing export fixture nodes');
    }

    bindElementBox(page, { left: 0, top: 0, width: 400, height: 300 });
    bindElementBox(canvas, { left: 0, top: 0, width: 400, height: 300 });
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');

    const textLayer = createDeckLayer('TextLayer', 'uniform-texts', {
      data: [
        { position: [10, 20], text: 'France' },
        { position: [30, 40], text: 'Germany' }
      ],
      getPosition: (d: { position: number[] }) => d.position,
      getText: (d: { text: string }) => d.text,
      getColor: () => [0, 0, 0, 255],
      getSize: () => 14,
      sizeUnits: 'pixels',
      fontFamily: 'Arial',
      fontWeight: '400',
      background: false
    });
    const deck = createDeckExportFixture([textLayer]);
    mapInstanceStore.setDeckInstance(deck as never);
    mapInstanceStore.setMapLoaded(true);

    const blob = await exportMapToSvg({ width: 400, height: 300 });
    const markup = await blob.text();

    const textLayerGroupMatch = markup.match(
      /<g[^>]*font-family="Arial"[^>]*>/
    );
    expect(textLayerGroupMatch).not.toBeNull();
    const groupTag = textLayerGroupMatch?.[0] ?? '';
    expect(groupTag).toContain('font-family="Arial"');
    expect(groupTag).toContain('font-weight="400"');
    expect(groupTag).toContain('font-size="14"');
    expect(groupTag).toContain('text-anchor="middle"');
    expect(groupTag).toContain('fill="rgb(0, 0, 0)"');

    const textElements = markup.match(/<text[^>]*>/g) ?? [];
    expect(textElements).toHaveLength(2);
    textElements.forEach((textElement) => {
      expect(textElement).not.toContain('font-family');
      expect(textElement).not.toContain('font-weight');
      expect(textElement).not.toContain('font-size');
      expect(textElement).not.toContain('text-anchor');
      expect(textElement).not.toContain('fill=');
    });
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
