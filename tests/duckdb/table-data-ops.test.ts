import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { DataTableFilter } from '$lib/features/duckdb/types';
import {
  getRowPosition,
  getTableData
} from '$lib/features/duckdb/orchestrator/table-data-ops';
import {
  clearState,
  setFilters
} from '$lib/features/duckdb/orchestrator/state.svelte';

function createDuck(queryResult?: { position?: number }) {
  return {
    describe_table: vi.fn().mockResolvedValue({
      name: [INTERNAL_COLUMN.ID, 'description'],
      type: ['INTEGER', 'VARCHAR']
    }),
    query: vi.fn().mockResolvedValue({
      numRows: queryResult ? 1 : 0,
      get: () => queryResult ?? {},
      toArray: () => (queryResult ? [queryResult] : [])
    }),
    describeColumns: vi.fn(),
    analyse: vi.fn()
  };
}

afterEach(() => {
  clearState();
  vi.clearAllMocks();
});

describe('getTableData', () => {
  it('orders text-like columns with the stripped HTML projection', async () => {
    const duck = createDuck();

    await getTableData('places', duck, {
      offset: 5,
      limit: 10,
      orderBy: 'description',
      orderByType: 'text',
      order: 'ASC'
    });

    const query = duck.query.mock.calls[0]?.[0];
    expect(query).toContain(
      'ORDER BY strip_html_text("description"::VARCHAR) ASC NULLS LAST, "__id" ASC'
    );
    expect(query).toContain('LIMIT 10');
    expect(query).toContain('OFFSET 5');
  });
});

describe('getRowPosition', () => {
  it('uses the stripped HTML projection in sorted row positioning', async () => {
    const duck = createDuck({ position: 3 });

    await getRowPosition('places', 42, duck, {
      orderBy: 'description',
      orderByType: 'text',
      order: 'DESC'
    });

    const query = duck.query.mock.calls[0]?.[0];
    expect(query).toContain(
      'ROW_NUMBER() OVER (ORDER BY strip_html_text("description"::VARCHAR) DESC NULLS LAST, "__id" DESC) - 1 AS position'
    );
    expect(query).toContain('WHERE __id = 42');
  });

  it('applies active filters before computing the sorted row position', async () => {
    const duck = createDuck({ position: 0 });
    const filters: DataTableFilter[] = [
      {
        id: 'filter-1',
        column: 'country',
        operator: 'equals',
        value: 'SG',
        sql: `"country" = 'SG'`,
        label: 'country = SG'
      }
    ];

    setFilters('places', filters);

    await getRowPosition('places', 7, duck, {
      orderBy: 'description',
      orderByType: 'text',
      order: 'ASC'
    });

    const query = duck.query.mock.calls[0]?.[0];
    expect(query).toContain(`FROM "places"`);
    expect(query).toContain(`WHERE "country" = 'SG'`);
  });
});
