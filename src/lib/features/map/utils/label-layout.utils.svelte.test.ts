import { describe, expect, it } from 'vitest';

import {
  computeLabelLeader,
  parseLabelLayouts,
  resolveLabelAlignment
} from './label-layout.utils';

function rounded(
  points: Array<[number, number]> | null
): Array<[number, number]> | null {
  return (
    points?.map(([x, y]) => [
      Math.round(x * 100) / 100 + 0,
      Math.round(y * 100) / 100 + 0
    ]) ?? null
  );
}

const SYMBOL_GAP = 3;
const MIN_GAP = 8;

describe('computeLabelLeader', () => {
  it('should draw no leader when the label covers its anchor', () => {
    expect(
      computeLabelLeader({
        center: [4, -2],
        halfSize: [20, 6],
        symbolRadius: 0,
        symbolGap: SYMBOL_GAP,
        minGap: MIN_GAP
      })
    ).toBeNull();
  });

  it('should draw no leader when the label stays close to the symbol', () => {
    expect(
      computeLabelLeader({
        center: [35, 0],
        halfSize: [20, 6],
        symbolRadius: 10,
        symbolGap: SYMBOL_GAP,
        minGap: MIN_GAP
      })
    ).toBeNull();
  });

  it('should leave the symbol at 45 degrees then run horizontally into the facing side', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [80, 40],
          halfSize: [20, 6],
          symbolRadius: 10,
          symbolGap: SYMBOL_GAP,
          minGap: MIN_GAP
        })
      )
    ).toEqual([
      [9.19, 9.19],
      [40, 40],
      [60, 40]
    ]);
  });

  it('should run horizontally from a buffer around the symbol when the label is level with it', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [-80, 0],
          halfSize: [20, 6],
          symbolRadius: 10,
          symbolGap: SYMBOL_GAP,
          minGap: MIN_GAP
        })
      )
    ).toEqual([
      [-13, 0],
      [-60, 0]
    ]);
  });

  it('should leave the buffer horizontally when the elbow would fall inside it', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [60, 5],
          halfSize: [20, 6],
          symbolRadius: 10,
          symbolGap: SYMBOL_GAP,
          minGap: MIN_GAP
        })
      )
    ).toEqual([
      [12, 5],
      [40, 5]
    ]);
  });

  it('should bend then run vertically into the top edge when the label sits mostly below', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [30, 80],
          halfSize: [20, 6],
          symbolRadius: 0,
          symbolGap: SYMBOL_GAP,
          minGap: MIN_GAP
        })
      )
    ).toEqual([
      [0, 0],
      [20, 20],
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
          symbolGap: SYMBOL_GAP,
          minGap: MIN_GAP
        })
      )
    ).toEqual([
      [0, -13],
      [0, -54]
    ]);
  });

  it('should keep a single 45 degree segment when no horizontal or vertical leg fits', () => {
    expect(
      rounded(
        computeLabelLeader({
          center: [50, 35],
          halfSize: [20, 10],
          symbolRadius: 0,
          symbolGap: SYMBOL_GAP,
          minGap: MIN_GAP
        })
      )
    ).toEqual([
      [0, 0],
      [30, 30]
    ]);
  });

  it('should only produce horizontal, vertical or 45 degree segments', () => {
    const centers: Array<[number, number]> = [
      [120, 17],
      [-37, 95],
      [64, -71],
      [-150, -12],
      [18, 140],
      [-90, 88]
    ];
    for (const center of centers) {
      const points = computeLabelLeader({
        center,
        halfSize: [24, 7],
        symbolRadius: 9,
        symbolGap: SYMBOL_GAP,
        minGap: MIN_GAP
      });
      expect(points).not.toBeNull();
      for (let index = 1; index < (points?.length ?? 0); index += 1) {
        const [x0, y0] = points![index - 1];
        const [x1, y1] = points![index];
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const isOctilinear = dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-9;
        expect(isOctilinear).toBe(true);
      }
    }
  });
});

describe('resolveLabelAlignment', () => {
  it('should flush left a label right of its anchor', () => {
    expect(resolveLabelAlignment([80, 10], [20, 6])).toBe('start');
  });

  it('should flush right a label left of its anchor', () => {
    expect(resolveLabelAlignment([-80, -10], [20, 6])).toBe('end');
  });

  it('should centre a label above or below its anchor', () => {
    expect(resolveLabelAlignment([15, -60], [30, 6])).toBe('middle');
    expect(resolveLabelAlignment([-30, 80], [20, 6])).toBe('middle');
  });

  it('should centre a label that still covers its anchor', () => {
    expect(resolveLabelAlignment([4, -2], [20, 6])).toBe('middle');
  });
});

describe('parseLabelLayouts', () => {
  it('should keep valid offsets and drop malformed ones when restoring', () => {
    expect(
      parseLabelLayouts({
        viz1: {
          'r:1': [12.5, -4],
          'r:2': [Number.NaN, 3],
          'r:3': ['1', 2],
          'r:4': [1, 2, 3]
        },
        viz2: 'broken',
        viz3: {}
      })
    ).toEqual({ viz1: { 'r:1': [12.5, -4] } });
  });

  it('should keep a __proto__ feature key as plain data', () => {
    const layouts = parseLabelLayouts(
      JSON.parse('{"viz1":{"__proto__":[1,2]}}')
    );

    expect(Object.getPrototypeOf(layouts.viz1)).toBe(Object.prototype);
    expect(Object.keys(layouts.viz1)).toEqual(['__proto__']);
  });
});
