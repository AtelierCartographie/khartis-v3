import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  statistics: null as Record<string, unknown> | null
}));

vi.mock('$lib/features/commons/stores/datasets.store.svelte', () => ({
  datasetsStore: {
    getColumnStatistics: () => mocks.statistics
  }
}));

import {
  DEFAULT_SYMBOL_SIGN_COLORS,
  isSignedProportionalSymbol,
  resolveSymbolSignColors
} from './symbol-sign.utils';

function makeViz(symbol: Record<string, unknown> = {}) {
  return {
    id: 'viz',
    datasetId: 'table1',
    mapping: {},
    symbol: { mode: 'proportional', sizeColumn: 'balance', ...symbol }
  } as never;
}

describe('isSignedProportionalSymbol', () => {
  beforeEach(() => {
    mocks.statistics = { min: -12, max: 40 };
  });

  it('should hold only when the size column crosses zero', () => {
    expect(isSignedProportionalSymbol(makeViz())).toBe(true);

    mocks.statistics = { min: 0, max: 40 };
    expect(isSignedProportionalSymbol(makeViz())).toBe(false);

    mocks.statistics = { min: -40, max: 0 };
    expect(isSignedProportionalSymbol(makeViz())).toBe(false);
  });

  it('should read integer statistics when DuckDB returns them as BigInt', () => {
    mocks.statistics = { min: -3n, max: 7n };
    expect(isSignedProportionalSymbol(makeViz())).toBe(true);
  });

  it('should not hold when the symbol is double or not proportional', () => {
    expect(
      isSignedProportionalSymbol(makeViz({ proportionalType: 'doubles' }))
    ).toBe(false);
    expect(isSignedProportionalSymbol(makeViz({ mode: 'classes' }))).toBe(
      false
    );
  });
});

describe('resolveSymbolSignColors', () => {
  it('should fall back to the default pair when the saved value is malformed', () => {
    expect(
      resolveSymbolSignColors(makeViz({ signColors: ['#123456', '#abcdef'] }))
    ).toEqual(['#123456', '#abcdef']);
    expect(
      resolveSymbolSignColors(makeViz({ signColors: ['#123456'] }))
    ).toEqual([...DEFAULT_SYMBOL_SIGN_COLORS]);
  });
});
