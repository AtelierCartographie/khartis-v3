import { describe, expect, it, vi } from 'vitest';
import {
  calculateToleranceFromRate,
  simplifyGeometryTable
} from '$lib/features/duckdb/operations/simplification';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import * as m from '$lib/paraglide/messages';

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
  it('throws a DataValidationError for invalid tolerance values', async () => {
    const Duck = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SUM(ST_NPoints')) {
          return [{ total_vertices: 100 }];
        }

        return [];
      }),
      invalidateTableCache: vi.fn()
    };

    const request = simplifyGeometryTable(
      Duck as unknown as Parameters<typeof simplifyGeometryTable>[0],
      'source_table',
      -1
    );

    await expect(request).rejects.toMatchObject({
      name: 'DataValidationError',
      code: 'DATA_VALIDATION_ERROR',
      field: 'tolerance',
      details: {
        field: 'tolerance',
        tolerance: -1
      }
    });
    await expect(request).rejects.toBeInstanceOf(DataValidationError);
  });

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
      }),
      invalidateTableCache: vi.fn()
    };

    await expect(
      simplifyGeometryTable(
        Duck as unknown as Parameters<typeof simplifyGeometryTable>[0],
        'source_table',
        0.5
      )
    ).rejects.toThrow(m.error_simplification_topology_failed());

    expect(queries.some((sql) => sql.includes('ST_Simplify'))).toBe(false);
  });

  it('escapes quoted identifiers and string macro arguments', async () => {
    const queries: string[] = [];
    const Duck = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);

        if (sql.includes('SUM(ST_NPoints')) {
          return [{ total_vertices: 100 }];
        }

        return [];
      }),
      invalidateTableCache: vi.fn()
    };

    await simplifyGeometryTable(
      Duck as unknown as Parameters<typeof simplifyGeometryTable>[0],
      'source"table',
      0.5,
      {
        geometryColumn: `geom' "col"`,
        inputTableName: `O'Brien "source"`,
        targetTableName: `target' "table"`
      }
    );

    expect(queries[0]).toContain(`FROM "O'Brien ""source"""`);
    expect(queries[0]).toContain(`ST_NPoints("geom' ""col""")`);
    expect(queries[1]).toContain(`CREATE OR REPLACE TABLE "target' ""table"""`);
    expect(queries[1]).toContain(
      `simplify_and_clean('O''Brien "source"', 'geom'' "col"', 0.5)`
    );
    expect(queries[2]).toContain(`FROM "target' ""table"""`);
    expect(queries[3]).toContain(
      `CREATE OR REPLACE TABLE "source""table__innerlines"`
    );
    expect(queries[3]).toContain(`extract_innerlines('target'' "table"')`);
    expect(Duck.invalidateTableCache).toHaveBeenCalledWith(`target' "table"`);
    expect(Duck.invalidateTableCache).toHaveBeenCalledWith(
      'source"table__innerlines'
    );
  });
});
