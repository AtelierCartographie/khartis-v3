import { describe, expect, it } from 'vitest';
import { canFinalizeJoin, hasBlockingJoinIssues } from './join-validation';

describe('join-validation', () => {
  it('detects blocking issues when entities are still to verify', () => {
    expect(
      hasBlockingJoinIssues({
        joinedCount: 10,
        toVerifyCount: 2,
        duplicateCount: 0
      })
    ).toBe(true);
  });

  it('detects blocking issues when duplicate keys exist', () => {
    expect(
      hasBlockingJoinIssues({
        joinedCount: 10,
        toVerifyCount: 0,
        duplicateCount: 1
      })
    ).toBe(true);
  });

  it('allows finalization only with matches and no blocking issues', () => {
    expect(
      canFinalizeJoin({
        joinedCount: 10,
        toVerifyCount: 0,
        duplicateCount: 0
      })
    ).toBe(true);

    expect(
      canFinalizeJoin({
        joinedCount: 0,
        toVerifyCount: 0,
        duplicateCount: 0
      })
    ).toBe(false);
  });
});
