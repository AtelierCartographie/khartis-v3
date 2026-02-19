import { describe, it, expect } from 'vitest';

describe('visualizationStore year filter types', () => {
  it('should define YearFilter interface structure', () => {
    const filter = { column: 'year', value: 2023 };
    expect(filter.column).toBe('year');
    expect(filter.value).toBe(2023);
  });

  it('should accept string year values', () => {
    const filter = { column: 'year', value: '2023' };
    expect(filter.value).toBe('2023');
  });

  it('should support numeric column filtering', () => {
    const filter = { column: 'annee', value: 2024 };
    expect(filter.column).toBe('annee');
    expect(filter.value).toBe(2024);
  });
});
