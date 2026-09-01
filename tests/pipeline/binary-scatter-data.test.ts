import { describe, expect, it } from 'vitest';
import {
  duplicateScatterBinaryGeometry,
  sortScatterBinaryDataByRadius,
  type ScatterBinaryData
} from '$lib/features/map/layers/binary-scatter-data';

function createPointData(positions: number[]): ScatterBinaryData {
  const count = positions.length / 2;
  return {
    length: count,
    featureIds: new Uint32Array(
      Array.from({ length: count }, (_, index) => index)
    ),
    attributes: {
      getPosition: { value: new Float32Array(positions), size: 2 }
    }
  };
}

describe('duplicateScatterBinaryGeometry', () => {
  it('mirrors positions and feature ids so each feature carries two points', () => {
    const data = createPointData([0, 0, 10, 20, 30, 40]);

    const stride = duplicateScatterBinaryGeometry(data);

    expect(stride).toBe(3);
    expect(data.length).toBe(6);
    expect(Array.from(data.featureIds ?? [])).toEqual([0, 1, 2, 0, 1, 2]);
    expect(
      Array.from((data.attributes.getPosition as { value: Float32Array }).value)
    ).toEqual([0, 0, 10, 20, 30, 40, 0, 0, 10, 20, 30, 40]);
  });

  it('refuses data whose positions do not match the feature ids', () => {
    const data = createPointData([0, 0, 10, 20]);
    data.featureIds = new Uint32Array([0, 1, 2]);

    expect(duplicateScatterBinaryGeometry(data)).toBeNull();
  });
});

describe('overlay double symbols draw order', () => {
  it('orders both variables into one descending radius sequence', () => {
    const data = createPointData([0, 0, 10, 10, 20, 20]);
    const stride = duplicateScatterBinaryGeometry(data);
    expect(stride).toBe(3);

    // A radii then B radii, deliberately interleaved in magnitude so a
    // per-variable sort would leave a small symbol buried under a large one.
    const radii = [4, 30, 12, 18, 6, 25];
    data.attributes.getRadius = {
      value: new Float32Array(radii),
      size: 1
    };

    sortScatterBinaryDataByRadius(data);

    const sorted = Array.from(
      (data.attributes.getRadius as { value: Float32Array }).value
    );
    expect(sorted).toEqual([...radii].sort((left, right) => right - left));
    // 30 (B of fid 1), 25 (B of fid 2), 18 (A of fid 0), 12 (A of fid 2),
    // 6 (B of fid 0), 4 (A of fid 1): the two variables interleave.
    expect(Array.from(data.featureIds ?? [])).toEqual([1, 2, 0, 2, 1, 0]);
  });
});
