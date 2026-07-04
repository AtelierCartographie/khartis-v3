import { describe, expect, it } from 'vitest';
import { EXPORT_RESOLUTION } from './types';
import {
  formatExportDimensions,
  getExportDimensionsForPage
} from './export-dimensions.utils';

describe('export dimensions utils', () => {
  it('scales the page long edge to the selected export resolution', () => {
    expect(
      getExportDimensionsForPage(800, 600, EXPORT_RESOLUTION.HD_1080P)
    ).toEqual({
      width: 1920,
      height: 1440
    });

    expect(
      getExportDimensionsForPage(600, 800, EXPORT_RESOLUTION.QHD_2K)
    ).toEqual({
      width: 1920,
      height: 2560
    });
  });

  it('normalizes unsafe dimensions before scaling and formatting', () => {
    expect(
      getExportDimensionsForPage(Number.NaN, 0, EXPORT_RESOLUTION.UHD_4K)
    ).toEqual({
      width: 3840,
      height: 3840
    });

    expect(formatExportDimensions({ width: 3840, height: 2160 })).toBe(
      '3840 × 2160 px'
    );
  });
});
