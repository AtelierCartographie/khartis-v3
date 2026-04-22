import { describe, expect, it } from 'vitest';
import type { BinaryPathData, BinaryPointData } from 'geoarrow-deck-stream';
import {
  pathColorAttr,
  pathWidthAttr,
  pointColorAttr
} from './geoarrow-stream-bridge';

function createPathData(): BinaryPathData {
  return {
    length: 2,
    positions: new Float32Array([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]),
    startIndices: new Uint32Array([0, 2, 5]),
    featureIds: new Uint32Array([10, 20]),
    size: 2
  };
}

function createPointData(): BinaryPointData {
  return {
    length: 3,
    positions: new Float32Array([0, 0, 1, 1, 2, 2]),
    featureIds: new Uint32Array([10, 20, 10]),
    size: 2
  };
}

describe('geoarrow stream bridge path attributes', () => {
  it('marks point colors as normalized Uint8 attributes for Deck.gl', () => {
    const attribute = pointColorAttr(createPointData(), (featureId) =>
      featureId === 10 ? [1, 2, 3, 4] : [5, 6, 7, 8]
    );

    expect(Array.from(attribute.value)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4
    ]);
    expect(attribute.size).toBe(4);
    expect(attribute.normalized).toBe(true);
  });

  it('replicates line colors for every vertex in each path', () => {
    const attribute = pathColorAttr(createPathData(), (featureId) =>
      featureId === 10 ? [1, 2, 3, 4] : [5, 6, 7, 8]
    );

    expect(Array.from(attribute.value)).toEqual([
      1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8, 5, 6, 7, 8
    ]);
    expect(attribute.size).toBe(4);
  });

  it('replicates line widths for every vertex in each path', () => {
    const attribute = pathWidthAttr(createPathData(), (featureId) =>
      featureId === 10 ? 2 : 6
    );

    expect(Array.from(attribute.value)).toEqual([2, 2, 6, 6, 6]);
    expect(attribute.size).toBe(1);
  });
});
