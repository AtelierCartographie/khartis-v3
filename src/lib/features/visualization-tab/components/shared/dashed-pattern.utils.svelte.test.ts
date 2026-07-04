import { describe, expect, it } from 'vitest';
import { BasemapDottedPattern } from '$lib/features/commons/constants/visualization.constants';
import {
  buildDashedPatternItems,
  coerceDashedPattern
} from './dashed-pattern.utils';

describe('dashed-pattern utils', () => {
  it('builds dashed pattern dropdown items in enum order', () => {
    const items = buildDashedPatternItems();

    expect(items.map((item) => item.id)).toEqual([
      BasemapDottedPattern.DOTS,
      BasemapDottedPattern.DASHES,
      BasemapDottedPattern.DASH_DOT,
      BasemapDottedPattern.LONG_DASH
    ]);
    expect(items.every((item) => item.text.length > 0)).toBe(true);
  });

  it('coerces unknown dashed pattern values to dots', () => {
    expect(coerceDashedPattern(BasemapDottedPattern.DASH_DOT)).toBe(
      BasemapDottedPattern.DASH_DOT
    );
    expect(coerceDashedPattern('long-dash')).toBe(
      BasemapDottedPattern.LONG_DASH
    );
    expect(coerceDashedPattern('unknown')).toBe(BasemapDottedPattern.DOTS);
    expect(coerceDashedPattern(1)).toBe(BasemapDottedPattern.DOTS);
    expect(coerceDashedPattern(undefined)).toBe(BasemapDottedPattern.DOTS);
  });
});
