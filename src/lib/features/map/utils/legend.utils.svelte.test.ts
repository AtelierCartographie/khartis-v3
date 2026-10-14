// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getProportionalLineLegendValues } from './legend.utils';

describe('getProportionalLineLegendValues', () => {
  it('should label the widest line with a rounded maximum when the data leaves room', () => {
    expect(
      getProportionalLineLegendValues(
        12_873,
        [120, 2_400, 7_310, 9_050, 12_873]
      )
    ).toEqual([13_000, 10_000, 5_000]);
  });

  it('should stop rounding the maximum down before it reaches the next value', () => {
    expect(
      getProportionalLineLegendValues(1_234, [3, 640, 1_220, 1_234])
    ).toEqual([1_230, 1_000, 500]);
  });

  it('should round the maximum to two significant digits when no sample is known', () => {
    expect(getProportionalLineLegendValues(48_712)).toEqual([
      49_000, 40_000, 20_000
    ]);
  });
});
