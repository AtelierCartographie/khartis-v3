import { describe, expect, it } from 'vitest';
import {
  clampWorkspacePanOffset,
  resolveWorkspaceFitScale,
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

  describe('resolveWorkspaceFitScale', () => {
    it('should scale the page up to at most 85% of the available workspace', () => {
      expect(
        resolveWorkspaceFitScale({
          viewportWidth: 1600,
          viewportHeight: 1000,
          pageWidth: 842,
          pageHeight: 595
        })
      ).toBeCloseTo(((1000 - 60) * 0.85) / 595, 6);
    });

    it('should reserve the step toolbar width before applying the 85% cap', () => {
      expect(
        resolveWorkspaceFitScale({
          viewportWidth: 1000,
          viewportHeight: 900,
          pageWidth: 842,
          pageHeight: 595,
          reservedInlineStartPx: 98
        })
      ).toBeCloseTo(((1000 - 98 - 60) * 0.85) / 842, 6);
    });

    it('should allow callers to opt into full available workspace coverage', () => {
      expect(
        resolveWorkspaceFitScale({
          viewportWidth: 1600,
          viewportHeight: 1000,
          pageWidth: 842,
          pageHeight: 595,
          maxViewportCoverageRatio: 1
        })
      ).toBeCloseTo((1000 - 60) / 595, 6);
    });

    it('should shrink below the readable preview floor when needed to fit the workspace', () => {
      expect(
        resolveWorkspaceFitScale({
          viewportWidth: 420,
          viewportHeight: 300,
          pageWidth: 842,
          pageHeight: 595
        })
      ).toBeLessThan(0.6);
    });
  });
});
