import { describe, expect, it } from 'vitest';
import {
  clampWorkspacePanOffset,
  isWorkspacePanTarget,
  resolveWorkspaceViewportBounds
} from './workspace-viewport.utils';

describe('workspace viewport utils', () => {
  it('computes bleed and overflow bounds for small viewports', () => {
    const bounds = resolveWorkspaceViewportBounds({
      viewportWidth: 600,
      viewportHeight: 500,
      pageWidth: 842,
      pageHeight: 595,
      pageZoomScale: 1
    });

    expect(bounds.bleedX).toBe(90);
    expect(bounds.bleedY).toBe(75);
    expect(bounds.maxOffsetX).toBe(211);
    expect(bounds.maxOffsetY).toBeCloseTo(122.5);
    expect(bounds.hasOverflow).toBe(true);
  });

  it('clamps offsets to the workspace camera bounds', () => {
    const bounds = resolveWorkspaceViewportBounds({
      viewportWidth: 600,
      viewportHeight: 500,
      pageWidth: 842,
      pageHeight: 595,
      pageZoomScale: 1
    });

    expect(clampWorkspacePanOffset({ x: 400, y: -300 }, bounds)).toEqual({
      x: 211,
      y: -122.5
    });
  });

  it('accepts passive map surfaces and rejects marked interactive targets', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="page-container">
        <div class="map-stage">
          <canvas></canvas>
        </div>
        <div class="legend-container" data-workspace-pan-ignore="true"></div>
      </div>
    `;

    const canvas = container.querySelector('canvas');
    const legend = container.querySelector('.legend-container');

    expect(isWorkspacePanTarget(canvas)).toBe(true);
    expect(isWorkspacePanTarget(legend)).toBe(false);
  });
});
