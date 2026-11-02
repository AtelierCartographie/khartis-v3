import { describe, expect, it } from 'vitest';
import { get_max_scale } from '../core/projscreen';
import { resolveFittedMapFrame } from './map-frame.utils';

const A4_LANDSCAPE = { width: 842, height: 595 };
const MARGINS = { top: 32, right: 32, bottom: 32, left: 32 };
const BASE = {
  page: A4_LANDSCAPE,
  margins: MARGINS,
  drawnBbox: null,
  fitPaddingPx: 10,
  minFrameSize: 100
};

describe('resolveFittedMapFrame', () => {
  it('should close the frame in on a wide map and keep its fit scale', () => {
    const referenceBbox: [number, number, number, number] = [0, 0, 200, 100];
    const frame = resolveFittedMapFrame({ ...BASE, referenceBbox });

    expect(frame).toEqual({ top: 98, right: 32, bottom: 98, left: 32 });

    const marginBox = { width: 778, height: 531 };
    const frameBox = {
      width: A4_LANDSCAPE.width - frame.left - frame.right,
      height: A4_LANDSCAPE.height - frame.top - frame.bottom
    };
    expect(get_max_scale(frameBox, referenceBbox, 10)).toBe(
      get_max_scale(marginBox, referenceBbox, 10)
    );
  });

  it('should keep the margin box when the drawn map overflows it', () => {
    const frame = resolveFittedMapFrame({
      ...BASE,
      referenceBbox: [0, 0, 200, 100],
      drawnBbox: [-400, -300, 600, 400]
    });

    expect(frame).toEqual(MARGINS);
  });

  it('should keep the frame centred on the reference when the drawn map is off-centre', () => {
    const frame = resolveFittedMapFrame({
      ...BASE,
      referenceBbox: [0, 0, 200, 100],
      drawnBbox: [0, 0, 200, 120]
    });

    expect(frame.top).toBe(frame.bottom);
    expect(frame.top).toBeLessThan(98);
  });

  it('should keep the minimum frame size when the map is a thin strip', () => {
    const frame = resolveFittedMapFrame({
      ...BASE,
      referenceBbox: [0, 0, 1000, 1]
    });

    expect(
      A4_LANDSCAPE.height - frame.top - frame.bottom
    ).toBeGreaterThanOrEqual(100);
  });

  it('should fall back to the margins when the reference has no area', () => {
    expect(
      resolveFittedMapFrame({ ...BASE, referenceBbox: [5, 5, 5, 5] })
    ).toEqual(MARGINS);
    expect(resolveFittedMapFrame({ ...BASE, referenceBbox: null })).toEqual(
      MARGINS
    );
  });
});
