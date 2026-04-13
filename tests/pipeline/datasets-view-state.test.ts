import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deserializeDatasetsViewState } from '$lib/features/commons/store/datasets-view-state';

describe('datasetsStore persisted view state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no persisted datasets view state exists', () => {
    expect(deserializeDatasetsViewState(undefined)).toBeNull();
  });

  it('keeps an explicit empty persisted datasets view state', () => {
    expect(
      deserializeDatasetsViewState({
        enabledSourceFileIds: [],
        hiddenColumnsBySourceFileId: {},
        simplificationBySourceFileId: {}
      })
    ).toEqual({
      enabledSourceFileIds: [],
      hiddenColumnsBySourceFileId: {},
      simplificationBySourceFileId: {}
    });
  });
});
