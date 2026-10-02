import { describe, expect, it, vi } from 'vitest';
import { simplifyGeometryTable } from '$lib/features/duckdb/operations/simplification';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import * as m from '$lib/paraglide/messages';

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

        if (sql.includes('ST_GeometryType')) {
          return [{ geometry_type: 'POLYGON' }];
        }

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

        if (sql.includes('ST_GeometryType')) {
          return [{ geometry_type: 'POLYGON' }];
        }

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

    const vertexCountQuery = queries.find((sql) =>
      sql.includes('SUM(ST_NPoints')
    );
    const createTargetQuery = queries.find((sql) =>
      sql.includes('CREATE OR REPLACE TABLE "target')
    );
    const innerlinesQuery = queries.find((sql) =>
      sql.includes('extract_innerlines')
    );
    const outerlinesQuery = queries.find((sql) =>
      sql.includes('extract_outerlines')
    );
    const landQuery = queries.find((sql) => sql.includes('extract_land('));

    expect(vertexCountQuery).toContain(`FROM "O'Brien ""source"""`);
    expect(vertexCountQuery).toContain(`ST_NPoints("geom' ""col""")`);
    expect(createTargetQuery).toContain(
      `CREATE OR REPLACE TABLE "target' ""table"""`
    );
    expect(createTargetQuery).toContain(
      `simplify_and_clean('O''Brien "source"', 'geom'' "col"', 0.5)`
    );
    expect(innerlinesQuery).toContain(
      `CREATE OR REPLACE TABLE "target' ""table""__innerlines"`
    );
    expect(innerlinesQuery).toContain(
      `extract_innerlines('target'' "table"', noding_factor := 0)`
    );
    expect(outerlinesQuery).toContain(
      `CREATE OR REPLACE TABLE "target' ""table""__outerlines"`
    );
    // The outer contour reuses the dissolved land table, not the source rows.
    expect(outerlinesQuery).toContain(
      `extract_outerlines('target'' "table"__land', noding_factor := 0)`
    );
    expect(landQuery).toContain(
      `CREATE OR REPLACE TABLE "target' ""table""__land"`
    );
    expect(landQuery).toContain(
      `extract_land('target'' "table"', noding_factor := 0)`
    );
    expect(Duck.invalidateTableCache).toHaveBeenCalledWith(`target' "table"`);
    expect(Duck.invalidateTableCache).toHaveBeenCalledWith(
      `target' "table"__land`
    );
    expect(Duck.invalidateTableCache).toHaveBeenCalledWith(
      `target' "table"__innerlines`
    );
    expect(Duck.invalidateTableCache).toHaveBeenCalledWith(
      `target' "table"__outerlines`
    );
  });

  it('routes line geometry through the line simplification macro', async () => {
    const queries: string[] = [];
    let vertexCountCall = 0;
    const Duck = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);

        if (sql.includes('ST_GeometryType')) {
          return [{ geometry_type: 'MULTILINESTRING' }];
        }

        if (sql.includes('SUM(ST_NPoints')) {
          vertexCountCall += 1;
          return [{ total_vertices: vertexCountCall === 1 ? 100 : 24 }];
        }

        return [];
      }),
      invalidateTableCache: vi.fn()
    };

    const result = await simplifyGeometryTable(
      Duck as unknown as Parameters<typeof simplifyGeometryTable>[0],
      'line_source',
      0.5
    );

    expect(queries).toContainEqual(
      expect.stringContaining(
        `FROM simplify_and_clean_linestring('line_source', 'geom', 0.5)`
      )
    );
    expect(queries.some((sql) => sql.includes('extract_innerlines'))).toBe(
      false
    );
    expect(result).toMatchObject({
      originalVertices: 100,
      simplifiedVertices: 24,
      reductionPercentage: 76
    });
  });

  it('preserves unsupported geometry families instead of dropping them', async () => {
    const queries: string[] = [];
    const Duck = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);

        if (sql.includes('ST_GeometryType')) {
          return [{ geometry_type: 'POINT' }];
        }

        if (sql.includes('SUM(ST_NPoints')) {
          return [{ total_vertices: 12 }];
        }

        return [];
      }),
      invalidateTableCache: vi.fn()
    };

    const result = await simplifyGeometryTable(
      Duck as unknown as Parameters<typeof simplifyGeometryTable>[0],
      'point_source',
      0.5
    );

    const createTargetQuery = queries.find((sql) =>
      sql.includes('CREATE OR REPLACE TABLE "point_source_simplified"')
    );
    expect(createTargetQuery).toContain('FROM "point_source"');
    expect(createTargetQuery).not.toContain('simplify_and_clean');
    expect(result).toMatchObject({
      originalVertices: 12,
      simplifiedVertices: 12,
      reductionPercentage: 0
    });
  });
});
