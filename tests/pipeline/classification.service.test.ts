import { describe, expect, it, vi } from 'vitest';

vi.mock('@ateliercartographie/ok-palette', () => ({
  sequential: ({ steps }: { steps: number }) =>
    Array.from(
      { length: steps },
      (_, i) => `#${i.toString(16).padStart(2, '0')}0000`
    ),
  divergentSequential: ({
    steps,
    hasCenterClass
  }: {
    steps: [number, number];
    hasCenterClass: boolean;
  }) => {
    const total = steps[0] + steps[1] + (hasCenterClass ? 1 : 0);
    return Array.from(
      { length: total },
      (_, i) => `#00${i.toString(16).padStart(2, '0')}00`
    );
  },
  resolvePalette: (colors: string[]) =>
    colors.map(() => [128, 128, 128, 255] as [number, number, number, number])
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: { query: vi.fn() }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: { getDatasetBySourceFile: vi.fn() }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  ClassificationMethod: {
    EQUAL_INTERVAL: 'equal_interval',
    QUANTILES: 'quantiles',
    JENKS: 'jenks',
    MANUAL: 'manual',
    STANDARD_DEVIATION: 'standard_deviation',
    Q6: 'q6',
    NESTED_MEANS: 'nested_means',
    HEAD_TAIL: 'head_tail'
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  LogCategory: { DATA: 'DATA' }
}));

import {
  applyPaletteInversion,
  generateColorsForBreaks
} from '$lib/features/commons/services/classification.service';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

describe('generateColorsForBreaks — sequential', () => {
  it('returns array of length numClasses with valid hex values', () => {
    const colors = generateColorsForBreaks(5);
    expect(colors).toHaveLength(5);
    for (const c of colors) expect(c).toMatch(HEX_COLOR);
  });

  it('clamps numClasses below 2 to 2', () => {
    expect(generateColorsForBreaks(1)).toHaveLength(2);
    expect(generateColorsForBreaks(0)).toHaveLength(2);
  });

  it('works for large class counts', () => {
    const colors = generateColorsForBreaks(9);
    expect(colors).toHaveLength(9);
    for (const c of colors) expect(c).toMatch(HEX_COLOR);
  });

  it('sequential is the default palette', () => {
    expect(generateColorsForBreaks(4, 'sequential')).toEqual(
      generateColorsForBreaks(4)
    );
  });
});

describe('generateColorsForBreaks — diverging', () => {
  it('returns array of length numClasses for even count', () => {
    const colors = generateColorsForBreaks(4, 'diverging');
    expect(colors).toHaveLength(4);
    for (const c of colors) expect(c).toMatch(HEX_COLOR);
  });

  it('returns array of length numClasses for odd count (center class)', () => {
    const colors = generateColorsForBreaks(5, 'diverging');
    expect(colors).toHaveLength(5);
    for (const c of colors) expect(c).toMatch(HEX_COLOR);
  });
});

describe('applyPaletteInversion', () => {
  const palette = ['#ff0000', '#00ff00', '#0000ff'];

  it('returns the same reference when not inverted', () => {
    expect(applyPaletteInversion(palette, false)).toBe(palette);
  });

  it('defaults to not inverted', () => {
    expect(applyPaletteInversion(palette)).toBe(palette);
  });

  it('returns reversed array when inverted', () => {
    expect(applyPaletteInversion(palette, true)).toEqual([
      '#0000ff',
      '#00ff00',
      '#ff0000'
    ]);
  });

  it('does not mutate the original when inverted', () => {
    const original = [...palette];
    applyPaletteInversion(palette, true);
    expect(palette).toEqual(original);
  });

  it('handles empty array', () => {
    expect(applyPaletteInversion([], true)).toEqual([]);
  });
});
