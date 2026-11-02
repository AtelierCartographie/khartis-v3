import { describe, expect, it } from 'vitest';
import { get_max_scale } from '../core/projscreen';
import type { BBox } from '../types';
import { measureDrawnExtent, resolveFittedMapFrame } from './map-frame.utils';

const A4_LANDSCAPE = { width: 842, height: 595 };
const MARGINS = { top: 32, right: 32, bottom: 32, left: 32 };
const BASE = {
  page: A4_LANDSCAPE,
  margins: MARGINS,
  drawnBbox: null,
  fitPaddingPx: 10,
  minFrameSize: 100
};

function renderedSize(
  frame: typeof MARGINS,
  zoom: number,
  bbox: BBox,
  referenceBbox: BBox
): { width: number; height: number } {
  const frameSize = {
    width: A4_LANDSCAPE.width - frame.left - frame.right,
    height: A4_LANDSCAPE.height - frame.top - frame.bottom
  };
  const scale = get_max_scale(frameSize, referenceBbox, 10) * 2 ** zoom;
  return {
    width: (bbox[2] - bbox[0]) * scale,
    height: (bbox[3] - bbox[1]) * scale
  };
}

describe('resolveFittedMapFrame', () => {
  it('should close the frame in on a wide map with no gap around it', () => {
    const referenceBbox: BBox = [0, 0, 200, 100];
    const { frame, zoom } = resolveFittedMapFrame({ ...BASE, referenceBbox });

    expect(frame).toEqual({ top: 103, right: 32, bottom: 103, left: 32 });
    const drawn = renderedSize(frame, zoom, referenceBbox, referenceBbox);
    expect(drawn.width).toBeCloseTo(778, 6);
    expect(drawn.height).toBeCloseTo(595 - 2 * 103, 6);
  });

  it('should drop the empty context of a clipped basemap when the geometry is smaller than the reference', () => {
    const referenceBbox: BBox = [0, 0, 240, 120];
    const drawnBbox: BBox = [20, 10, 220, 110];
    const { frame, zoom } = resolveFittedMapFrame({
      ...BASE,
      referenceBbox,
      drawnBbox
    });

    expect(frame).toEqual({ top: 103, right: 32, bottom: 103, left: 32 });
    expect(zoom).toBeGreaterThan(0);
    expect(
      renderedSize(frame, zoom, drawnBbox, referenceBbox).width
    ).toBeCloseTo(778, 6);
  });

  it('should centre the view on the drawn map when it sits off the reference centre', () => {
    const { frame, centerRatio } = resolveFittedMapFrame({
      ...BASE,
      referenceBbox: [0, 0, 200, 100],
      drawnBbox: [0, 0, 200, 60]
    });

    expect(frame).toEqual({ top: 180, right: 32, bottom: 180, left: 32 });
    expect(centerRatio[0]).toBeCloseTo(0, 6);
    expect(centerRatio[1]).toBeCloseTo(-0.2, 6);
  });

  it('should keep the margin box and the fit when the drawn map overflows it', () => {
    const { frame, zoom } = resolveFittedMapFrame({
      ...BASE,
      referenceBbox: [0, 0, 200, 100],
      drawnBbox: [-400, -300, 600, 400]
    });

    expect(frame).toEqual(MARGINS);
    expect(zoom).toBeCloseTo(0, 6);
  });

  it('should keep the minimum frame size when the map is a thin strip', () => {
    const { frame } = resolveFittedMapFrame({
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
    ).toEqual({ frame: MARGINS, zoom: 0, centerRatio: [0, 0] });
    expect(resolveFittedMapFrame({ ...BASE, referenceBbox: null })).toEqual({
      frame: MARGINS,
      zoom: 0,
      centerRatio: [0, 0]
    });
  });
});

describe('measureDrawnExtent', () => {
  it('should merge the binary positions of visible layers when the layer list is nested', () => {
    const polygon = {
      props: {
        data: {
          attributes: {
            getPolygon: { value: new Float32Array([0, 0, 10, 5]), size: 2 }
          }
        }
      }
    };
    const path = {
      props: {
        data: {
          attributes: {
            getPath: { value: new Float64Array([-3, 2, 4, 12]), size: 2 }
          }
        }
      }
    };
    const hidden = {
      props: {
        visible: false,
        data: {
          attributes: {
            getPosition: { value: new Float32Array([500, 500, 0]), size: 3 }
          }
        }
      }
    };

    expect(
      measureDrawnExtent([polygon, [path, null, hidden], { props: {} }])
    ).toEqual([-3, 0, 10, 12]);
  });
});
