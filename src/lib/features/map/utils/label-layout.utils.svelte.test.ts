import { describe, expect, it } from 'vitest';

import { computeLabelLeader, parseLabelLayouts } from './label-layout.utils';

function rounded(
  points: Array<[number, number]> | null
): Array<[number, number]> | null {
  return (
    points?.map(([x, y]) => [
      Math.round(x * 100) / 100,
      Math.round(y * 100) / 100
    ]) ?? null
  );
}

describe('computeLabelLeader', () => {
  it('should draw no leader when the label covers its anchor', () => {
    expect(
      computeLabelLeader({
        center: [4, -2],
        halfSize: [20, 6],
        symbolRadius: 0,
        minGap: 8,
        style: 'straight'
      })
    ).toBeNull();
  });

  it('should draw no leader when the label stays close to the symbol', () => {
    expect(
      computeLabelLeader({
        center: [35, 0],
        halfSize: [20, 6],
        symbolRadius: 10,
        minGap: 8,
        style: 'straight'
      })
    ).toBeNull();
  });

  it('should draw no leader when the style is none', () => {
    expect(
      computeLabelLeader({
        center: [200, 0],
        halfSize: [20, 6],
        symbolRadius: 10,
        minGap: 8,
        style: 'none'
      })
    ).toBeNull();
  });

  it('should run from the symbol edge to the facing side midpoint when the label sits beside it', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [80, 40],
          halfSize: [20, 6],
          symbolRadius: 10,
          minGap: 8,
          style: 'straight'
        })
      )
    ).toEqual([
      [8.32, 5.55],
      [60, 40]
    ]);
  });

  it('should attach to the left side when the label sits left of the symbol', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [-80, 0],
          halfSize: [20, 6],
          symbolRadius: 10,
          minGap: 8,
          style: 'straight'
        })
      )
    ).toEqual([
      [-10, 0],
      [-60, 0]
    ]);
  });

  it('should attach to the top edge within its central half when the label sits mostly below', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [30, 80],
          halfSize: [20, 6],
          symbolRadius: 0,
          minGap: 8,
          style: 'straight'
        })
      )
    ).toEqual([
      [0, 0],
      [20, 74]
    ]);
  });

  it('should stay vertical when the label sits straight above the symbol', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [5, -60],
          halfSize: [30, 6],
          symbolRadius: 10,
          minGap: 8,
          style: 'straight'
        })
      )
    ).toEqual([
      [0, -10],
      [0, -54]
    ]);
  });

  it('should bend at 45 degrees then run horizontally into the label with the elbow style', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [80, 40],
          halfSize: [20, 6],
          symbolRadius: 10,
          minGap: 8,
          style: 'elbow'
        })
      )
    ).toEqual([
      [7.07, 7.07],
      [40, 40],
      [60, 40]
    ]);
  });

  it('should leave the symbol horizontally when the elbow would fall inside it', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [60, 5],
          halfSize: [20, 6],
          symbolRadius: 10,
          minGap: 8,
          style: 'elbow'
        })
      )
    ).toEqual([
      [8.66, 5],
      [40, 5]
    ]);
  });

  it('should fall back to a straight leader when the label sits mostly below with the elbow style', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [30, 80],
          halfSize: [20, 6],
          symbolRadius: 0,
          minGap: 8,
          style: 'elbow'
        })
      )
    ).toEqual([
      [0, 0],
      [20, 74]
    ]);
  });
});

describe('parseLabelLayouts', () => {
  it('should keep valid offsets and drop malformed ones when restoring', () => {
    expect(
      parseLabelLayouts({
        viz1: {
          leaderStyle: 'elbow',
          offsets: {
            'r:1': [12.5, -4],
            'r:2': [Number.NaN, 3],
            'r:3': ['1', 2],
            'r:4': [1, 2, 3]
          }
        },
        viz2: 'broken'
      })
    ).toEqual({
      viz1: { leaderStyle: 'elbow', offsets: { 'r:1': [12.5, -4] } }
    });
  });

  it('should fall back to straight leaders when the stored style is unknown', () => {
    expect(
      parseLabelLayouts({
        viz1: { leaderStyle: 'curved', offsets: { 'r:1': [1, 2] } }
      })
    ).toEqual({
      viz1: { leaderStyle: 'straight', offsets: { 'r:1': [1, 2] } }
    });
  });

  it('should keep a __proto__ feature key as plain data', () => {
    const layouts = parseLabelLayouts(
      JSON.parse('{"viz1":{"offsets":{"__proto__":[1,2]}}}')
    );

    expect(Object.getPrototypeOf(layouts.viz1.offsets)).toBe(Object.prototype);
    expect(Object.keys(layouts.viz1.offsets)).toEqual(['__proto__']);
  });
});
