import { describe, expect, it } from 'vitest';
import { Binary, makeTable, vectorFromArray } from 'apache-arrow';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import { geoIdentity } from 'd3-geo';
import type { BinaryPathData, BinaryPointData } from 'geoarrow-deck-stream';
import {
  pathColorAttr,
  pathWidthAttr,
  pointColorAttr,
  parsePointDataWithProjection
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

function wkbPoint(x: number, y: number): Uint8Array {
  const bytes = new Uint8Array(21);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 1);
  view.setUint32(1, 1, true);
  view.setFloat64(5, x, true);
  view.setFloat64(13, y, true);
  return bytes;
}

function binaryVector(values: Uint8Array[]): Uint8Array {
  return vectorFromArray(values, new Binary()) as unknown as Uint8Array;
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

  it('decodes projected WKB point tables without dropping rows', () => {
    const table = makeTable({
      geometry: binaryVector([wkbPoint(2, 3), wkbPoint(-4, 5)])
    }) as ArrowTable;
    const projection = geoIdentity().scale(2).translate([10, 0]);

    const data = parsePointDataWithProjection(table, projection);

    expect(data.length).toBe(2);
    expect(Array.from(data.positions.slice(0, data.length * 2))).toEqual([
      14, 6, 2, 10
    ]);
    expect(Array.from(data.featureIds.slice(0, data.length))).toEqual([0, 1]);
  });
});
