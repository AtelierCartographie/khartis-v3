import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportMapToSvg } from './map-export.utils';

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

describe('map export DOM mutations', () => {
  afterEach(() => {
    document.body.innerHTML = '';
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

  it('keeps MapLibre interleaved exports at the live canvas pixel ratio', () => {
    expect(source).toContain('function usesInterleavedDeckOverlay');
    expect(source).toContain('mapInstanceStore.deckOverlay !== null');
    expect(source).toContain(
      'if (!map || usesInterleavedDeckOverlay()) return () => {};'
    );
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
