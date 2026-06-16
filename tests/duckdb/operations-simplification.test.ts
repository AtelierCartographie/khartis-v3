import { describe, expect, it, vi } from 'vitest';
import {
  calculateToleranceFromRate,
  simplifyGeometryTable
} from '$lib/features/duckdb/operations/simplification';

describe('calculateToleranceFromRate', () => {
  it('converts 0% to 0.0 (no simplification)', () => {
    expect(calculateToleranceFromRate(0)).toBe(0);
  });

  it('converts 100% to 1.0 (maximum simplification)', () => {
    expect(calculateToleranceFromRate(100)).toBe(1);
  });

  it('converts 50% to 0.5', () => {
    expect(calculateToleranceFromRate(50)).toBe(0.5);
  });

  it('clamps values above 100 to 1.0', () => {
    expect(calculateToleranceFromRate(150)).toBe(1);
  });

  it('clamps negative values to 0.0', () => {
    expect(calculateToleranceFromRate(-10)).toBe(0);
  });

  it('produces monotonically increasing output as rate increases', () => {
    const rates = [0, 10, 25, 50, 75, 90, 100];
    const tolerances = rates.map((r) => calculateToleranceFromRate(r));
    for (let i = 1; i < tolerances.length; i++) {
      expect(tolerances[i]).toBeGreaterThanOrEqual(tolerances[i - 1]);
    }
  });
});

describe('simplifyGeometryTable', () => {
  it('throws without falling back to topology-breaking ST_Simplify when the macro fails', async () => {
    const queries: string[] = [];
    const Duck = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);

        if (sql.includes('SUM(ST_NPoints')) {
          return [{ total_vertices: 100 }];
        }

        if (sql.includes('FROM simplify_and_clean')) {
          throw new Error('simplify_and_clean failed');
        }

        return [];
      })
    };

    await expect(
      simplifyGeometryTable(
        Duck as unknown as Parameters<typeof simplifyGeometryTable>[0],
        'source_table',
        0.5
      )
    ).rejects.toThrow('Topology-preserving simplification failed');

    expect(queries.some((sql) => sql.includes('ST_Simplify'))).toBe(false);
  });
});
