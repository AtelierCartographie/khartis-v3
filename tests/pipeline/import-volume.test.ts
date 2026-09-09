import { describe, expect, it, vi } from 'vitest';
import {
  assertImportRowCountWithinLimit,
  readParquetRowCount
} from '$lib/features/data-pipeline/operations/import-volume';
import { IMPORT_ROW_LIMITS } from '$lib/features/commons/constants/validation.config';

describe('import volume guard', () => {
  it('should accept a dataset sitting exactly on the row limit', () => {
    expect(() =>
      assertImportRowCountWithinLimit(IMPORT_ROW_LIMITS.MAX, 'cities.parquet')
    ).not.toThrow();
  });

  it('should reject a dataset over the row limit with the count in the details', () => {
    expect(() =>
      assertImportRowCountWithinLimit(
        IMPORT_ROW_LIMITS.MAX + 1,
        'cities.parquet'
      )
    ).toThrowError(
      expect.objectContaining({
        name: 'DataValidationError',
        details: expect.objectContaining({
          fileName: 'cities.parquet',
          rowCount: IMPORT_ROW_LIMITS.MAX + 1,
          maxRows: IMPORT_ROW_LIMITS.MAX
        })
      })
    );
  });

  it('should read the Parquet row count from the footer as a plain number', async () => {
    const duck = {
      query: vi.fn().mockResolvedValue([{ num_rows: 1_754_470n }])
    };

    await expect(readParquetRowCount(duck, 'file-id')).resolves.toBe(1_754_470);
    expect(duck.query.mock.calls[0][0]).toContain(
      "parquet_file_metadata('file-id')"
    );
  });

  it('should total the row counts when the Parquet handle covers several files', async () => {
    const duck = {
      query: vi.fn().mockResolvedValue([{ num_rows: 400n }, { num_rows: 600n }])
    };

    await expect(readParquetRowCount(duck, 'file-id')).resolves.toBe(1000);
  });

  it('should fall back to the post-read count when the footer is unreadable', async () => {
    const duck = {
      query: vi.fn().mockRejectedValue(new Error('not a parquet file'))
    };

    await expect(readParquetRowCount(duck, 'file-id')).resolves.toBeNull();
  });
});
