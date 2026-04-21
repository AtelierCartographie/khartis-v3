import { describe, expect, it } from 'vitest';
import {
  clampWorkspacePanOffset,
  isWorkspacePanTarget,
  resolveReadablePagePreviewScale,
  resolveFitToWorkspaceZoom,
  resolveWorkspaceViewportBounds
} from './workspace-viewport.utils';

describe('workspace viewport utils', () => {
  it('should compute bleed and overflow bounds when page is larger than viewport', () => {
    const bounds = resolveWorkspaceViewportBounds({
      viewportWidth: 600,
      viewportHeight: 500,
      pageWidth: 842,
      pageHeight: 595,
      pageZoomScale: 1
    });

    expect(bounds.bleedX).toBe(120);
    expect(bounds.bleedY).toBe(100);
    expect(bounds.maxOffsetX).toBe(241);
    expect(bounds.maxOffsetY).toBe(200);
    expect(bounds.hasOverflow).toBe(true);
  });

  it('should allow free drag range when page fits entirely in viewport', () => {
    const bounds = resolveWorkspaceViewportBounds({
      viewportWidth: 1920,
      viewportHeight: 1080,
      pageWidth: 842,
      pageHeight: 595,
      pageZoomScale: 1
    });

    expect(bounds.hasOverflow).toBe(false);
    expect(bounds.maxOffsetX).toBe(1920 * 0.4);
    expect(bounds.maxOffsetY).toBe(1080 * 0.4);
  });

  it('should clamp offsets to the workspace camera bounds', () => {
    const bounds = resolveWorkspaceViewportBounds({
      viewportWidth: 600,
      viewportHeight: 500,
      pageWidth: 842,
      pageHeight: 595,
      pageZoomScale: 1
    });

    expect(clampWorkspacePanOffset({ x: 400, y: -300 }, bounds)).toEqual({
      x: 241,
      y: -200
    });
  });

  it('should accept passive map surfaces and reject marked interactive targets', () => {
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

  describe('resolveFitToWorkspaceZoom', () => {
    it('should compute a fit zoom below 100% when page is larger than viewport', () => {
      const fit = resolveFitToWorkspaceZoom({
        viewportWidth: 600,
        viewportHeight: 500,
        pageWidth: 842,
        pageHeight: 595
      });

      expect(fit).toBeGreaterThan(20);
      expect(fit).toBeLessThan(100);
    });

    it('should scale fit zoom beyond 100% when viewport is much larger than page', () => {
      const fit = resolveFitToWorkspaceZoom({
        viewportWidth: 3000,
        viewportHeight: 2000,
        pageWidth: 842,
        pageHeight: 595
      });

      expect(fit).toBeGreaterThan(100);
    });

    it('should apply 30px padding on each side by default', () => {
      const viewportWidth = 1000;
      const viewportHeight = 1000;
      const pageWidth = 940;
      const pageHeight = 940;

      const fit = resolveFitToWorkspaceZoom({
        viewportWidth,
        viewportHeight,
        pageWidth,
        pageHeight
      });

      expect(fit).toBe(100);
    });

    it('should floor fit zoom at 20% when page is extremely large vs viewport', () => {
      const fit = resolveFitToWorkspaceZoom({
        viewportWidth: 300,
        viewportHeight: 200,
        pageWidth: 4000,
        pageHeight: 3000
      });

      expect(fit).toBe(20);
    });

    it('should cap fit zoom at 500% even when viewport is huge', () => {
      const fit = resolveFitToWorkspaceZoom({
        viewportWidth: 10000,
        viewportHeight: 10000,
        pageWidth: 100,
        pageHeight: 100
      });

      expect(fit).toBe(500);
    });

    it('should accept a custom padding', () => {
      const withDefaultPadding = resolveFitToWorkspaceZoom({
        viewportWidth: 1000,
        viewportHeight: 1000,
        pageWidth: 500,
        pageHeight: 500
      });
      const withLargePadding = resolveFitToWorkspaceZoom({
        viewportWidth: 1000,
        viewportHeight: 1000,
        pageWidth: 500,
        pageHeight: 500,
        paddingPx: 200
      });

      expect(withLargePadding).toBeLessThan(withDefaultPadding);
    });

    it('should return 100% when viewport or page dimensions are zero', () => {
      expect(
        resolveFitToWorkspaceZoom({
          viewportWidth: 0,
          viewportHeight: 500,
          pageWidth: 842,
          pageHeight: 595
        })
      ).toBe(100);
    });
  });

  describe('resolveReadablePagePreviewScale', () => {
    it('should preserve readable preview scale for oversized page formats', () => {
      expect(resolveReadablePagePreviewScale(0.435185)).toBe(0.6);
    });

    it('should keep scales that are already readable unchanged', () => {
      expect(resolveReadablePagePreviewScale(0.79)).toBe(0.79);
    });

    it('should clamp invalid values back to 1', () => {
      expect(resolveReadablePagePreviewScale(0)).toBe(1);
    });
  });
});
