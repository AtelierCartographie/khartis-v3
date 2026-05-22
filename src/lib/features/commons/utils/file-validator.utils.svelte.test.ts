import { describe, expect, it } from 'vitest';
import { FileValidator } from './file-validator.utils';
import * as m from '$lib/paraglide/messages';

describe('file-validator utils', () => {
  it('warns when CSV content has no supported separator', async () => {
    const file = new File(['name\nParis\nLyon'], 'names.csv', {
      type: 'text/csv'
    });
    const initialResult = FileValidator.validate(file);

    const result = await FileValidator.validateAsync(file, initialResult);

    expect(result.warnings).toContain(m.validation_csv_no_separator());
  });
});
