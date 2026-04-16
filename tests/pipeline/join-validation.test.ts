import { describe, expect, it } from 'vitest';
import {
  canFinalizeJoin,
  hasBlockingJoinIssues
} from '$lib/features/main-toolbar/data-tab/services/join-validation';

describe('hasBlockingJoinIssues', () => {
  it('returns true when toVerifyCount > 0', () => {
    expect(
      hasBlockingJoinIssues({
        joinedCount: 10,
        toVerifyCount: 2,
        duplicateCount: 0
      })
    ).toBe(true);
  });

  it('returns false when toVerifyCount is 0', () => {
    expect(
      hasBlockingJoinIssues({
        joinedCount: 10,
        toVerifyCount: 0,
        duplicateCount: 0
      })
    ).toBe(false);
  });

  it('ignores joinedCount and duplicateCount', () => {
    expect(
      hasBlockingJoinIssues({
        joinedCount: 0,
        toVerifyCount: 0,
        duplicateCount: 50
      })
    ).toBe(false);
    expect(
      hasBlockingJoinIssues({
        joinedCount: 100,
        toVerifyCount: 1,
        duplicateCount: 0
      })
    ).toBe(true);
  });
});

describe('canFinalizeJoin', () => {
  it('returns true when joined > 0 and no toVerify issues', () => {
    expect(
      canFinalizeJoin({ joinedCount: 10, toVerifyCount: 0, duplicateCount: 0 })
    ).toBe(true);
  });

  it('returns false when joinedCount is 0', () => {
    expect(
      canFinalizeJoin({ joinedCount: 0, toVerifyCount: 0, duplicateCount: 0 })
    ).toBe(false);
  });

  it('returns false when there are verify-pending rows', () => {
    expect(
      canFinalizeJoin({ joinedCount: 10, toVerifyCount: 3, duplicateCount: 0 })
    ).toBe(false);
  });

  it('allows finalization with duplicates only', () => {
    expect(
      canFinalizeJoin({ joinedCount: 10, toVerifyCount: 0, duplicateCount: 5 })
    ).toBe(true);
  });
});
