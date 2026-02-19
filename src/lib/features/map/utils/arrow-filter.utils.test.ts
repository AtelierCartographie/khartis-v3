import { describe, it, expect } from 'vitest';
import { buildYearFilterWhereClause } from '../../duckdb/orchestrator/arrow-ops';

describe('buildYearFilterWhereClause', () => {
  it('should return null when filter is undefined', () => {
    const result = buildYearFilterWhereClause(undefined);
    expect(result).toBeNull();
  });

  it('should build WHERE clause for numeric year value', () => {
    const result = buildYearFilterWhereClause({ column: 'year', value: 2023 });
    expect(result).toBe('"year" = 2023');
  });

  it('should build WHERE clause for string year value', () => {
    const result = buildYearFilterWhereClause({
      column: 'annee',
      value: '2023'
    });
    expect(result).toBe('"annee" = \'2023\'');
  });

  it('should escape single quotes in string values', () => {
    const result = buildYearFilterWhereClause({
      column: 'year',
      value: "2023'; DROP TABLE users; --"
    });
    expect(result).toBe("\"year\" = '2023''; DROP TABLE users; --'");
    expect(result?.includes("''")).toBe(true);
  });

  it('should handle column names with special characters', () => {
    const result = buildYearFilterWhereClause({
      column: 'year_value',
      value: 2023
    });
    expect(result).toBe('"year_value" = 2023');
  });
});
