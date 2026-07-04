import { describe, expect, it } from 'vitest';
import { ColumnType } from '$lib/features/data-pipeline';
import {
  DEFAULT_FILTER_LIMIT,
  MAX_FILTER_LIMIT,
  getFilterColumnType
} from './filter-operators.utils';

describe('filter-operators utils', () => {
  it('resolves filter column types from shared field options', () => {
    const fields = [
      { text: 'population', type: 'DOUBLE' },
      { text: 'name', type: 'VARCHAR' },
      { text: 'created_at', type: 'TIMESTAMP' },
      { text: 'enabled', type: 'BOOLEAN' }
    ];

    expect(getFilterColumnType(fields, 'population')).toBe(ColumnType.NUMBER);
    expect(getFilterColumnType(fields, 'name')).toBe(ColumnType.TEXT);
    expect(getFilterColumnType(fields, 'created_at')).toBe(ColumnType.DATE);
    expect(getFilterColumnType(fields, 'enabled')).toBe(ColumnType.BOOLEAN);
    expect(getFilterColumnType(fields, 'missing')).toBeNull();
  });

  it('shares the default and maximum filter limits', () => {
    expect(DEFAULT_FILTER_LIMIT).toBe(5);
    expect(MAX_FILTER_LIMIT).toBe(1000);
  });
});
