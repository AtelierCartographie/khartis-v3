import { beforeEach, describe, expect, it, vi } from 'vitest';
import { simplification_macros } from '$lib/features/duckdb/macros/simplification';

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerSuccessMock: vi.fn()
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DUCKDB: 'DUCKDB'
  },
  logger: {
    info: mocks.loggerInfoMock,
    success: mocks.loggerSuccessMock,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import {
  calculateToleranceFromRate,
  simplifyGeometryTable
} from '$lib/features/duckdb/operations/simplification';

function createDuck() {
  return {
    query: mocks.queryMock,
    describe_table: vi.fn()
  };
}

describe('simplification operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the full polygon cleanup macro chain', () => {
    expect(simplification_macros).toContain(
      'CREATE OR REPLACE MACRO snap_topology_normalized'
    );
    expect(simplification_macros).toContain(
      'CREATE OR REPLACE MACRO extract_innerlines'
    );
    expect(simplification_macros).toContain(
      'SELECT row_number() OVER () as _gid, geom'
    );
    expect(simplification_macros).toContain('FROM snap_topology_normalized');
    expect(simplification_macros).toContain(
      'FROM simplify_topology_normalized'
    );
    expect(simplification_macros).toContain('FROM prune_triangles');
    expect(simplification_macros).toContain(
      'CREATE OR REPLACE MACRO snap_linestring_normalized'
    );
    expect(simplification_macros).toContain(
      'CREATE OR REPLACE MACRO simplify_linestring_normalized'
    );
    expect(simplification_macros).toContain(
      'CREATE OR REPLACE MACRO simplify_and_clean_linestring'
    );
    expect(simplification_macros).toContain(
      'FROM simplify_linestring_normalized'
    );
  });

  it('clamps simplification rate between 0 and 1', () => {
    expect(calculateToleranceFromRate(-10)).toBe(0);
    expect(calculateToleranceFromRate(0)).toBe(0);
    expect(calculateToleranceFromRate(25)).toBe(0.25);
    expect(calculateToleranceFromRate(100)).toBe(1);
    expect(calculateToleranceFromRate(130)).toBe(1);
  });

  it('rejects invalid tolerance for table simplification', async () => {
    mocks.queryMock.mockResolvedValueOnce([{ total_vertices: 12 }]);
    const Duck = createDuck();

    await expect(simplifyGeometryTable(Duck, 'cities', -0.1)).rejects.toThrow(
      'Invalid simplification tolerance'
    );

    expect(mocks.queryMock).toHaveBeenCalledTimes(1);
  });

  it('simplifies a table and reports vertex reduction', async () => {
    mocks.queryMock
      .mockResolvedValueOnce([{ total_vertices: 100 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ total_vertices: 40 }]);
    const Duck = createDuck();

    const metrics = await simplifyGeometryTable(Duck, 'communes', 0.2);

    expect(metrics.originalVertices).toBe(100);
    expect(metrics.simplifiedVertices).toBe(40);
    expect(metrics.reductionPercentage).toBe(60);
    expect(metrics.duration).toBeGreaterThanOrEqual(0);
    expect(mocks.queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CREATE OR REPLACE TABLE "communes_simplified"')
    );
    expect(mocks.queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        "FROM simplify_and_clean('communes', 'geom', 0.2)"
      )
    );
  });

  it('can write a simplified view with a custom geometry column', async () => {
    mocks.queryMock
      .mockResolvedValueOnce([{ total_vertices: 30 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ total_vertices: 15 }]);
    const Duck = createDuck();

    const metrics = await simplifyGeometryTable(Duck, 'roads', 0.5, {
      createView: true,
      geometryColumn: 'geometry'
    });

    expect(metrics.reductionPercentage).toBe(50);
    expect(mocks.queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CREATE OR REPLACE VIEW "vw_roads_simplified"')
    );
    expect(mocks.queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        "FROM simplify_and_clean('roads', 'geometry', 0.5)"
      )
    );
  });
});
