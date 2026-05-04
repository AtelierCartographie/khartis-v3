import { describe, expect, it } from 'vitest';
import { canFinalizeJoin } from '$lib/features/main-toolbar/data-tab/services/join-validation';

describe('canFinalizeJoin', () => {
  it('returns true when at least one entity is joined', () => {
    expect(canFinalizeJoin({ joinedCount: 10 })).toBe(true);
  });

  it('returns false when no entities are joined', () => {
    expect(canFinalizeJoin({ joinedCount: 0 })).toBe(false);
  });

  it('still allows finalization regardless of verify-pending or duplicate counts', () => {
    expect(canFinalizeJoin({ joinedCount: 1 })).toBe(true);
  });
});
