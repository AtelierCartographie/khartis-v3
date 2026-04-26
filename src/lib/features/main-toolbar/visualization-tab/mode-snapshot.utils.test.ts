import { describe, expect, it } from 'vitest';
import { applyByKeys, snapshotByKeys } from './mode-snapshot.utils';

interface Sample {
  alpha: number;
  beta: string;
  gamma: boolean;
  delta?: number;
}

describe('mode-snapshot.utils', () => {
  describe('snapshotByKeys', () => {
    it('should pick only the requested keys', () => {
      const source: Sample = { alpha: 1, beta: 'x', gamma: true, delta: 9 };
      const snapshot = snapshotByKeys(source, ['alpha', 'gamma'] as const);
      expect(snapshot).toEqual({ alpha: 1, gamma: true });
    });

    it('should preserve undefined values', () => {
      const source: Sample = { alpha: 0, beta: '', gamma: false };
      const snapshot = snapshotByKeys(source, [
        'alpha',
        'beta',
        'delta'
      ] as const);
      expect(snapshot).toEqual({ alpha: 0, beta: '', delta: undefined });
    });
  });

  describe('applyByKeys', () => {
    it('should map state values onto a partial bag for each key', () => {
      const state: Partial<Sample> = { alpha: 5, gamma: true };
      const result = applyByKeys<Sample>(state, [
        'alpha',
        'beta',
        'gamma'
      ] as const);
      expect(result).toEqual({ alpha: 5, beta: undefined, gamma: true });
    });

    it('should return undefined values when state is undefined', () => {
      const result = applyByKeys<Sample>(undefined, ['alpha', 'beta'] as const);
      expect(result).toEqual({ alpha: undefined, beta: undefined });
    });
  });
});
