import { describe, expect, it } from 'vitest';
import { canFinalizeJoin, hasBlockingJoinIssues } from './join-validation';

describe('join-validation', () => {
  describe('hasBlockingJoinIssues', () => {
    it('returns true when unresolved entities exist', () => {
      const stats = { joinedCount: 10, toVerifyCount: 1, duplicateCount: 0 };
      expect(hasBlockingJoinIssues(stats)).toBe(true);
    });

    it('returns true when multiple unresolved entities exist', () => {
      const stats = { joinedCount: 50, toVerifyCount: 5, duplicateCount: 2 };
      expect(hasBlockingJoinIssues(stats)).toBe(true);
    });

    it('returns false when no unresolved entities exist', () => {
      const stats = { joinedCount: 10, toVerifyCount: 0, duplicateCount: 0 };
      expect(hasBlockingJoinIssues(stats)).toBe(false);
    });

    it('returns false when only duplicates exist (no unresolved)', () => {
      const stats = { joinedCount: 10, toVerifyCount: 0, duplicateCount: 5 };
      expect(hasBlockingJoinIssues(stats)).toBe(false);
    });
  });

  describe('canFinalizeJoin', () => {
    it('blocks finalization when unresolved entities exist (TC-JOIN-007)', () => {
      const stats = { joinedCount: 10, toVerifyCount: 1, duplicateCount: 0 };
      expect(canFinalizeJoin(stats)).toBe(false);
    });

    it('blocks finalization when single unresolved entity exists with matches', () => {
      const stats = { joinedCount: 100, toVerifyCount: 1, duplicateCount: 0 };
      expect(canFinalizeJoin(stats)).toBe(false);
    });

    it('blocks finalization when multiple unresolved entities exist', () => {
      const stats = { joinedCount: 50, toVerifyCount: 3, duplicateCount: 2 };
      expect(canFinalizeJoin(stats)).toBe(false);
    });

    it('allows finalization with duplicates when no unresolved entities exist', () => {
      const stats = { joinedCount: 10, toVerifyCount: 0, duplicateCount: 2 };
      expect(canFinalizeJoin(stats)).toBe(true);
    });

    it('blocks finalization when zero matches exist (TC-JOIN-009)', () => {
      const stats = { joinedCount: 0, toVerifyCount: 0, duplicateCount: 0 };
      expect(canFinalizeJoin(stats)).toBe(false);
    });

    it('blocks finalization when zero matches and unresolved entities exist', () => {
      const stats = { joinedCount: 0, toVerifyCount: 2, duplicateCount: 0 };
      expect(canFinalizeJoin(stats)).toBe(false);
    });

    it('allows finalization when all entities matched and none unresolved', () => {
      const stats = { joinedCount: 195, toVerifyCount: 0, duplicateCount: 0 };
      expect(canFinalizeJoin(stats)).toBe(true);
    });

    it('allows finalization with high duplicate count when no unresolved', () => {
      const stats = { joinedCount: 100, toVerifyCount: 0, duplicateCount: 50 };
      expect(canFinalizeJoin(stats)).toBe(true);
    });
  });

  describe('duplicate detection (TC-JOIN-008)', () => {
    it('duplicateCount > 0 does not block finalization without unresolved entities', () => {
      const stats = { joinedCount: 80, toVerifyCount: 0, duplicateCount: 81 };
      expect(canFinalizeJoin(stats)).toBe(true);
      expect(hasBlockingJoinIssues(stats)).toBe(false);
    });

    it('duplicateCount > 0 with unresolved entities blocks finalization', () => {
      const stats = { joinedCount: 0, toVerifyCount: 82, duplicateCount: 81 };
      expect(canFinalizeJoin(stats)).toBe(false);
      expect(hasBlockingJoinIssues(stats)).toBe(true);
    });

    it('Year column scenario: all rows have same value creates duplicates but match count determines finalization', () => {
      const statsWithMatches = {
        joinedCount: 1,
        toVerifyCount: 0,
        duplicateCount: 81
      };
      expect(canFinalizeJoin(statsWithMatches)).toBe(true);

      const statsWithoutMatches = {
        joinedCount: 0,
        toVerifyCount: 82,
        duplicateCount: 81
      };
      expect(canFinalizeJoin(statsWithoutMatches)).toBe(false);
    });
  });
});
