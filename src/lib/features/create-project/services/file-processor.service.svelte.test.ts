import { describe, expect, it } from 'vitest';
import { DuckDBError, ParseError } from '$lib/features/commons/pipeline.errors';
import { FileType } from '$lib/features/commons/types/create-project.types';
import * as m from '$lib/paraglide/messages';
import { getReadableErrorMessage } from './file-processor.service';

describe('getReadableErrorMessage', () => {
  it('should keep the message of a localized pipeline error', () => {
    const error = new ParseError(
      m.pipeline_error_shp_standalone(),
      FileType.SHAPEFILE
    );

    expect(getReadableErrorMessage(error)).toBe(
      m.pipeline_error_shp_standalone()
    );
  });

  it('should map the engine text of a failed query without leaking it', () => {
    const error = new DuckDBError(
      'Conversion Error: CSV Error on Line: 3\nOriginal Line: secret,row\n  file = /tmp/f_123.csv',
      "SELECT * FROM read_csv('f_123.csv')"
    );

    const message = getReadableErrorMessage(error);

    expect(message).toBe(
      m.pipeline_error_csv_read_failed_at_line({ line: '3' })
    );
  });

  it('should fall back to the generic message for an unknown raw error', () => {
    expect(getReadableErrorMessage(new Error('boom'))).toBe(
      m.pipeline_error_generic()
    );
  });
});
