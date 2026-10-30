import { describe, expect, it } from 'vitest';

import { parseLabelLayouts } from './label-layout.utils';

describe('parseLabelLayouts', () => {
  it('should keep valid offsets and texts and drop malformed ones when restoring', () => {
    expect(
      parseLabelLayouts({
        viz1: {
          offsets: {
            'r:1': [12.5, -4],
            'r:2': [Number.NaN, 3],
            'r:3': ['1', 2],
            'r:4': [1, 2, 3]
          },
          texts: {
            'r:1': { primary: 'Saint-Jacques', secondary: 42 },
            'r:2': { primary: '   ' },
            'r:3': 'broken'
          }
        },
        viz2: 'broken',
        viz3: { offsets: {}, texts: {} }
      })
    ).toEqual({
      viz1: {
        offsets: { 'r:1': [12.5, -4] },
        texts: { 'r:1': { primary: 'Saint-Jacques' } }
      }
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
