import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'map-export.utils.ts'),
  'utf8'
);

describe('map export DOM mutations', () => {
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
});
