import { describe, expect, it } from 'vitest';
import { getDatasetIdentity, shouldResetJoinState } from './dataset-identity';

describe('dataset-identity', () => {
  it('uses sourceFileId as stable identity when available', () => {
    expect(
      getDatasetIdentity({ id: 'dataset-v2', sourceFileId: 'source-file-a' })
    ).toBe('source-file-a');
  });

  it('falls back to dataset id when sourceFileId is empty', () => {
    expect(getDatasetIdentity({ id: 'dataset-v2', sourceFileId: '' })).toBe(
      'dataset-v2'
    );
  });

  it('returns null when dataset is missing', () => {
    expect(getDatasetIdentity(undefined)).toBeNull();
  });
});

describe('shouldResetJoinState', () => {
  it('does not reset when state initializes for the first dataset', () => {
    expect(
      shouldResetJoinState({
        previousIdentity: null,
        currentIdentity: 'source-file-a',
        hasDatasets: true
      })
    ).toBe(false);
  });

  it('does not reset when dataset id changes but source identity is stable', () => {
    expect(
      shouldResetJoinState({
        previousIdentity: 'source-file-a',
        currentIdentity: 'source-file-a',
        hasDatasets: true
      })
    ).toBe(false);
  });

  it('does not reset during transient null selection while datasets still exist', () => {
    expect(
      shouldResetJoinState({
        previousIdentity: 'source-file-a',
        currentIdentity: null,
        hasDatasets: true
      })
    ).toBe(false);
  });

  it('resets when switching to a different dataset source', () => {
    expect(
      shouldResetJoinState({
        previousIdentity: 'source-file-a',
        currentIdentity: 'source-file-b',
        hasDatasets: true
      })
    ).toBe(true);
  });

  it('resets when all datasets are removed', () => {
    expect(
      shouldResetJoinState({
        previousIdentity: 'source-file-a',
        currentIdentity: null,
        hasDatasets: false
      })
    ).toBe(true);
  });
});
