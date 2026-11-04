import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildFilterClause,
  buildFilterWhereClause,
  combineFilterClauses,
  createFilterRecord
} from '$lib/features/duckdb/orchestrator/filter-ops';
import { FilterOperatorEnum } from '$lib/features/duckdb/types';
import { resolveFacetDataFilters } from '$lib/features/commons/utils/viz-filter.utils';
import type { VizDataFilter } from '$lib/features/commons/stores/visualization.types';
import { search_macros } from '$lib/features/duckdb/macros/search';
import {
  getColumnDomainsInScope,
  getRowIdsInScope,
  getScopedRowStats
} from '$lib/features/duckdb/orchestrator/table-data-ops';
import {
  clearFiltersForTable,
  setFilters
} from '$lib/features/duckdb/orchestrator/state.svelte';
import type {
  DataTableFilter,
  DataTableFilterInput
} from '$lib/features/duckdb/types';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';
import type { DuckClient } from '$lib/features/duckdb';

const TABLE = 'communes';

let db: TestDuckDB;

function tableFilters(...inputs: DataTableFilterInput[]): DataTableFilter[] {
  return inputs.map((input, index) =>
    createFilterRecord(TABLE, input, `table-${index}`)
  );
}

function scopeClause(
  level1: DataTableFilterInput[],
  level2: DataTableFilterInput[]
): string | null {
  return combineFilterClauses([
    buildFilterWhereClause(tableFilters(...level1)),
    buildFilterClause(TABLE, level2)
  ]);
}

function duckClient(): DuckClient {
  return {
    query: async (sql: string) => {
      const rows = await query(db, sql);
      return { numRows: rows.length, get: (index: number) => rows[index] };
    }
  } as unknown as DuckClient;
}

async function namesInScope(clause: string | null): Promise<string[]> {
  const rows = await query(
    db,
    `SELECT name FROM "${TABLE}"${clause ? ` WHERE ${clause}` : ''} ORDER BY name`
  );
  return rows.map((row) => String(row.name));
}

beforeAll(async () => {
  db = await createTestInstance();
  await run(db, search_macros);
  await run(
    db,
    `CREATE TABLE "${TABLE}" (
       __id INTEGER,
       name VARCHAR,
       region VARCHAR,
       pop INTEGER,
       pop_1968 INTEGER
     )`
  );
  await run(
    db,
    `INSERT INTO "${TABLE}" VALUES
       (1, 'Ajaccio', 'Corse', 71361, 42300),
       (2, 'Bastia', 'Corse', 48146, 50100),
       (3, 'Corte', 'Corse', 7451, 5400),
       (4, 'Lille', 'Hauts-de-France', 236234, 190500),
       (5, 'Roubaix', 'Hauts-de-France', 98828, 114500),
       (6, 'Cambrai', 'Hauts-de-France', 32501, 39900)`
  );
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('combineFilterClauses', () => {
  it('drops absent levels and keeps a single clause unwrapped', () => {
    expect(combineFilterClauses([null, null])).toBeNull();
    expect(combineFilterClauses([null, 'pop >= 1000'])).toBe('pop >= 1000');
  });

  it('conjoins the levels that are present', () => {
    expect(combineFilterClauses(['a >= 1', null, 'b <= 2'])).toBe(
      'a >= 1 AND b <= 2'
    );
  });
});

describe('buildFilterClause', () => {
  it('returns null when a primitive carries no filter', () => {
    expect(buildFilterClause(TABLE, [])).toBeNull();
  });

  it('compiles primitive filters with the same builder as table filters', () => {
    const input: DataTableFilterInput = {
      column: 'pop',
      operator: FilterOperatorEnum.GTE,
      value: '50000'
    };

    expect(buildFilterClause(TABLE, [input])).toBe(
      buildFilterWhereClause(tableFilters(input))
    );
  });
});

describe('row scope against DuckDB', () => {
  it('runs with no filter at all', async () => {
    await expect(namesInScope(scopeClause([], []))).resolves.toHaveLength(6);
  });

  it('applies the primitive filter on top of the table filter', async () => {
    const level1: DataTableFilterInput[] = [
      {
        column: 'region',
        columnType: 'varchar',
        operator: FilterOperatorEnum.EQUALS,
        value: 'Hauts-de-France'
      }
    ];
    const level2: DataTableFilterInput[] = [
      { column: 'pop', operator: FilterOperatorEnum.GTE, value: '50000' }
    ];

    await expect(namesInScope(scopeClause(level1, []))).resolves.toEqual([
      'Cambrai',
      'Lille',
      'Roubaix'
    ]);
    await expect(namesInScope(scopeClause(level1, level2))).resolves.toEqual([
      'Lille',
      'Roubaix'
    ]);
  });

  it('keeps a top-N primitive filter ranked over the whole table', async () => {
    const clause = scopeClause(
      [],
      [{ column: 'pop', operator: FilterOperatorEnum.TOP_DESC, limit: 2 }]
    );

    await expect(namesInScope(clause)).resolves.toEqual(['Lille', 'Roubaix']);
  });

  it('narrows the value domain the discretization reads', async () => {
    const scoped = scopeClause(
      [
        {
          column: 'region',
          columnType: 'varchar',
          operator: FilterOperatorEnum.EQUALS,
          value: 'Corse'
        }
      ],
      []
    );

    const [whole] = await query(
      db,
      `SELECT MIN(pop) AS lo, MAX(pop) AS hi FROM "${TABLE}"`
    );
    const [inScope] = await query(
      db,
      `SELECT MIN(pop) AS lo, MAX(pop) AS hi FROM "${TABLE}" WHERE ${scoped}`
    );

    expect([Number(whole.lo), Number(whole.hi)]).toEqual([7451, 236234]);
    expect([Number(inScope.lo), Number(inScope.hi)]).toEqual([7451, 71361]);
  });
});

describe('top filter ranked in each map of a collection', () => {
  function facetClause(
    filters: VizDataFilter[],
    facetVariable: string
  ): string | null {
    return buildFilterClause(
      TABLE,
      (resolveFacetDataFilters(filters, facetVariable) ?? []).map((filter) => ({
        column: filter.column,
        operator: filter.operator,
        value: filter.value,
        limit: filter.limit
      }))
    );
  }

  const topThree = (perFacet: boolean): VizDataFilter => ({
    id: 'top',
    column: 'pop',
    operator: 'top_asc',
    value: '3',
    limit: 3,
    perFacet
  });

  it('ranks each map on its own variable', async () => {
    await expect(
      namesInScope(facetClause([topThree(true)], 'pop'))
    ).resolves.toEqual(['Bastia', 'Cambrai', 'Corte']);
    await expect(
      namesInScope(facetClause([topThree(true)], 'pop_1968'))
    ).resolves.toEqual(['Ajaccio', 'Cambrai', 'Corte']);
  });

  it('keeps the stored column when the filter is shared by the collection', async () => {
    await expect(
      namesInScope(facetClause([topThree(false)], 'pop_1968'))
    ).resolves.toEqual(['Bastia', 'Cambrai', 'Corte']);
  });

  it('never retargets a filter that is not a top', async () => {
    const overFortyThousand: VizDataFilter = {
      id: 'gte',
      column: 'pop',
      operator: 'gte',
      value: '40000',
      perFacet: true
    };

    await expect(
      namesInScope(facetClause([overFortyThousand], 'pop_1968'))
    ).resolves.toEqual(['Ajaccio', 'Bastia', 'Lille', 'Roubaix']);
  });
});

describe('getRowIdsInScope', () => {
  it('returns the internal ids the clause keeps', async () => {
    const clause = scopeClause(
      [
        {
          column: 'region',
          columnType: 'varchar',
          operator: FilterOperatorEnum.EQUALS,
          value: 'Corse'
        }
      ],
      []
    );

    await expect(
      getRowIdsInScope(TABLE, clause as string, duckClient())
    ).resolves.toEqual(new Set([1, 2, 3]));
  });

  it('excludes rows whose predicate is NULL rather than keeping them', async () => {
    await expect(
      getRowIdsInScope(TABLE, 'NULL', duckClient())
    ).resolves.toEqual(new Set());
  });
});

describe('getColumnDomainsInScope', () => {
  it('narrows the domain to the rows in scope', async () => {
    const clause = scopeClause(
      [
        {
          column: 'region',
          columnType: 'varchar',
          operator: FilterOperatorEnum.EQUALS,
          value: 'Hauts-de-France'
        }
      ],
      []
    );

    const domains = await getColumnDomainsInScope(
      TABLE,
      clause,
      ['pop'],
      duckClient()
    );

    expect(domains.get('pop')).toEqual({ min: 32501, max: 236234 });
  });

  it('covers the whole table when no clause is active', async () => {
    const domains = await getColumnDomainsInScope(
      TABLE,
      null,
      ['pop'],
      duckClient()
    );

    expect(domains.get('pop')).toEqual({ min: 7451, max: 236234 });
  });

  it('leaves a non-numeric column without a domain', async () => {
    const domains = await getColumnDomainsInScope(
      TABLE,
      null,
      ['name', 'pop'],
      duckClient()
    );

    expect(domains.has('name')).toBe(false);
    expect(domains.has('pop')).toBe(true);
  });

  it('asks nothing when no column is driven', async () => {
    await expect(
      getColumnDomainsInScope(TABLE, null, [], duckClient())
    ).resolves.toEqual(new Map());
  });
});

describe('getScopedRowStats', () => {
  const corsica: DataTableFilterInput = {
    column: 'region',
    columnType: 'varchar',
    operator: FilterOperatorEnum.EQUALS,
    value: 'Corse'
  };
  const overFortyThousand = buildFilterClause(TABLE, [
    { column: 'pop', operator: FilterOperatorEnum.GTE, value: '40000' }
  ]) as string;

  afterEach(() => {
    clearFiltersForTable(TABLE);
  });

  it('counts the whole table when nothing is filtered', async () => {
    await expect(getScopedRowStats(TABLE, null, duckClient())).resolves.toEqual(
      {
        total: 6,
        filtered: 6
      }
    );
  });

  it('measures a primitive filter against the whole table when no table filter is active', async () => {
    await expect(
      getScopedRowStats(TABLE, overFortyThousand, duckClient())
    ).resolves.toEqual({ total: 6, filtered: 4 });
  });

  it('takes the table filter as the denominator a primitive works against', async () => {
    setFilters(TABLE, tableFilters(corsica));

    await expect(
      getScopedRowStats(TABLE, scopeClause([corsica], []), duckClient())
    ).resolves.toEqual({ total: 3, filtered: 3 });

    await expect(
      getScopedRowStats(
        TABLE,
        combineFilterClauses([
          buildFilterWhereClause(tableFilters(corsica)),
          overFortyThousand
        ]),
        duckClient()
      )
    ).resolves.toEqual({ total: 3, filtered: 2 });
  });
});
