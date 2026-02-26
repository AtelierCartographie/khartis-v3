import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DUCK_CONST } from '$lib/features/duckdb/constants';
import { SimplificationLevel } from '$lib/features/commons/types/enums';

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn(),
  addGeoArrowMetadataMock: vi.fn(),
  tableFromIpcMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerSuccessMock: vi.fn(),
  loggerDebugMock: vi.fn()
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DUCKDB: 'DUCKDB'
  },
  logger: {
    info: mocks.loggerInfoMock,
    success: mocks.loggerSuccessMock,
    debug: mocks.loggerDebugMock
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/arrow-ops', () => ({
  addGeoArrowMetadataFromDuckDB: mocks.addGeoArrowMetadataMock
}));

vi.mock('apache-arrow/Arrow', () => ({
  Table: class MockTable {},
  tableFromIPC: mocks.tableFromIpcMock
}));

import {
  SIMPLIFICATION_FACTOR,
  SIMPLIFICATION_TOLERANCE,
  calculateToleranceFromRate,
  getSimplifiedArrowTable,
  simplifyGeometryTable
} from '$lib/features/duckdb/operations/simplification';

function createDuck() {
  return {
    query: mocks.queryMock,
    describe_table: vi.fn(),
    copy_to_geoparquet_as_buffer: vi.fn()
  };
}

describe('simplification operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes expected simplification constants', () => {
    expect(SIMPLIFICATION_FACTOR[SimplificationLevel.Low]).toBe(0.15);
    expect(SIMPLIFICATION_FACTOR[SimplificationLevel.Medium]).toBe(0.4);
    expect(SIMPLIFICATION_FACTOR[SimplificationLevel.High]).toBe(0.75);

    expect(SIMPLIFICATION_TOLERANCE[SimplificationLevel.Low]).toBe(0.0001);
    expect(SIMPLIFICATION_TOLERANCE[SimplificationLevel.Medium]).toBe(0.001);
    expect(SIMPLIFICATION_TOLERANCE[SimplificationLevel.High]).toBe(0.01);
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

  it('rejects invalid tolerance for Arrow simplification', async () => {
    const Duck = createDuck();
    await expect(getSimplifiedArrowTable(Duck, 'cities', NaN)).rejects.toThrow(
      'Invalid simplification tolerance'
    );
    expect(mocks.queryMock).not.toHaveBeenCalled();
  });

  it('returns simplified Arrow table with GeoArrow metadata', async () => {
    const ipc = new Uint8Array([1, 2, 3, 4]);
    const rawTable = { numRows: 2, numCols: 1 };
    const enrichedTable = { numRows: 2, numCols: 1, enriched: true };

    mocks.queryMock.mockResolvedValueOnce(ipc.buffer);
    mocks.tableFromIpcMock.mockReturnValueOnce(rawTable);
    mocks.addGeoArrowMetadataMock.mockResolvedValueOnce(enrichedTable);

    const Duck = createDuck();
    const table = await getSimplifiedArrowTable(Duck, 'departements', 0.3);

    expect(mocks.queryMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "FROM simplify_and_clean('departements', 'geom', 0.3)"
      ),
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
    expect(mocks.tableFromIpcMock).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(mocks.addGeoArrowMetadataMock).toHaveBeenCalledWith(
      rawTable,
      'departements',
      Duck
    );
    expect(table).toBe(enrichedTable);
  });
});
