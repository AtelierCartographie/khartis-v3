import { describe, expect, it } from 'vitest';
import { canFinalizeJoin, hasBlockingJoinIssues } from './join-validation';

describe('join-validation', () => {
  it('blocks finalization when entities are still to verify', () => {
    const stats = { joinedCount: 10, toVerifyCount: 1, duplicateCount: 0 };

    expect(hasBlockingJoinIssues(stats)).toBe(true);
    expect(canFinalizeJoin(stats)).toBe(false);
  });

  it('allows finalization with duplicates when there is no unresolved entity', () => {
    const stats = { joinedCount: 10, toVerifyCount: 0, duplicateCount: 2 };

    expect(hasBlockingJoinIssues(stats)).toBe(false);
    expect(canFinalizeJoin(stats)).toBe(true);
  });

  it('requires at least one joined entity', () => {
    const stats = { joinedCount: 0, toVerifyCount: 0, duplicateCount: 0 };

    expect(canFinalizeJoin(stats)).toBe(false);
  });
});
