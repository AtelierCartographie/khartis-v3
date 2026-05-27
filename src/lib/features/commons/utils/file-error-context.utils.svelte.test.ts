import { describe, expect, it } from 'vitest';
import { buildFileErrorContext } from './file-error-context.utils';

describe('buildFileErrorContext', () => {
  it('keeps file name and basic metadata only', () => {
    const fakeFile = {
      id: 'file-1',
      name: 'naissances-2018.csv',
      size: 4096,
      type: 'text/csv',
      status: 'imported',
      sourceType: 'upload',
      duckdbTableName: 'tbl_naissances',
      joinedBasemap: 'communes_fr'
    } as unknown as Parameters<typeof buildFileErrorContext>[0];

    const context = buildFileErrorContext(fakeFile, { isFatal: true });

    expect(context).toMatchObject({
      fileId: 'file-1',
      fileName: 'naissances-2018.csv',
      fileSize: 4096,
      fileType: 'text/csv',
      fileExtension: 'csv',
      duckdbTableName: 'tbl_naissances',
      joinedBasemap: 'communes_fr',
      isFatal: true
    });
    expect('content' in context).toBe(false);
    expect('parsedData' in context).toBe(false);
  });

  it('returns only overrides when file is null', () => {
    const context = buildFileErrorContext(null, { isFatal: false });

    expect(context).toEqual({ isFatal: false });
  });
});
