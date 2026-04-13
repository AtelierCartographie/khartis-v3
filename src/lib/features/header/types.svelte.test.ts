import { describe, expect, it } from 'vitest';

import {
  EXPORT_RESOLUTION,
  formatExportDimensions,
  getExportDimensionsForPage
} from './types';

describe('getExportDimensionsForPage', () => {
  it('preserves a landscape page ratio for raster export', () => {
    expect(
      getExportDimensionsForPage(842, 595, EXPORT_RESOLUTION.HD_1080P)
    ).toEqual({
      width: 1920,
      height: 1357
    });
  });

  it('preserves a portrait page ratio for raster export', () => {
    expect(
      getExportDimensionsForPage(595, 842, EXPORT_RESOLUTION.QHD_2K)
    ).toEqual({
      width: 1809,
      height: 2560
    });
  });

  it('keeps square layouts square', () => {
    expect(
      getExportDimensionsForPage(1000, 1000, EXPORT_RESOLUTION.UHD_4K)
    ).toEqual({
      width: 3840,
      height: 3840
    });
  });
});

describe('formatExportDimensions', () => {
  it('formats export dimensions for UI display', () => {
    expect(formatExportDimensions({ width: 1920, height: 1357 })).toBe(
      '1920 × 1357 px'
    );
  });
});
