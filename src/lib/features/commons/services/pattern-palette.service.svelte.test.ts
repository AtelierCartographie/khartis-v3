import { describe, expect, it } from 'vitest';
import {
  DIVERGING_PATTERN_MAX_SIZE,
  type PatternPaletteConfig
} from '../constants/pattern.constants';
import { resolveClassPatterns } from './pattern-palette.service';

const SIDE_COLORS: [string, string] = ['#aa0000', '#0000aa'];

function diverging(
  cfg: Partial<PatternPaletteConfig>,
  split = { lowerCount: 3, upperCount: 3 },
  contrast?: 'high'
) {
  return resolveClassPatterns(
    split.lowerCount + split.upperCount,
    { shape: 'line', divergingColors: SIDE_COLORS, ...cfg },
    'sequential',
    contrast,
    false,
    split
  );
}

describe('resolveClassPatterns — diverging', () => {
  it('should grow the motif away from the breakpoint on each side', () => {
    const sizes = diverging({}, { lowerCount: 2, upperCount: 4 }).map(
      (pattern) => pattern.size
    );
    const lower = sizes.slice(0, 2);
    const upper = sizes.slice(2);
    expect(lower[0]).toBeGreaterThan(lower[1]);
    expect(upper).toEqual([...upper].sort((a, b) => a - b));
    expect(new Set(upper).size).toBe(upper.length);
  });

  it('should color each side with its own hue whatever the contrast', () => {
    for (const contrast of [undefined, 'high'] as const) {
      const fills = diverging({}, undefined, contrast).map((p) => p.fill);
      expect(fills).toEqual([
        ...Array(3).fill('#aa0000'),
        ...Array(3).fill('#0000aa')
      ]);
    }
  });

  it('should keep the sides opposed while following the chosen angle', () => {
    const cases: [PatternPaletteConfig['shape'], number, string, number][] = [
      ['line', 30, 'line', 120],
      ['triangle', 0, 'triangle', 180],
      ['plus', 0, 'plus', 45],
      ['plaid', 45, 'plaid', 45]
    ];
    for (const [shape, angle, lowerType, lowerAngle] of cases) {
      const patterns = diverging({ shape, angle });
      expect(patterns[0]).toMatchObject({ type: lowerType, angle: lowerAngle });
      expect(patterns[5].angle).toBe(angle);
    }
    expect(diverging({ shape: 'plaid', angle: 45 })[5].type).toBe('line');
  });

  it('should draw a cross as a plus turned by 45° and replace shapes it cannot oppose', () => {
    const cross = diverging({ shape: 'cross', angle: 0 });
    expect(cross[5]).toMatchObject({ type: 'plus', angle: 45 });
    expect(cross[0]).toMatchObject({ type: 'plus', angle: 90 });
    expect(diverging({ shape: 'circle' })[5].type).toBe('line');
  });

  it('should stop triangles and plus before they touch their neighbours', () => {
    for (const shape of ['triangle', 'plus'] as const) {
      const sizes = diverging(
        { shape },
        { lowerCount: 4, upperCount: 4 },
        'high'
      ).map((p) => p.size);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(
        DIVERGING_PATTERN_MAX_SIZE[shape]
      );
    }
  });

  it('should keep a single ordered ramp when there is no breakpoint', () => {
    const sizes = resolveClassPatterns(5, { shape: 'line' }, 'sequential').map(
      (p) => p.size
    );
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });
});
