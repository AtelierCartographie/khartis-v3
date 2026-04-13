import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { normalizeFormattedNumericColumns } from '$lib/features/data-pipeline/operations/tabular-numeric-normalization';
import {
  createTestInstance,
  destroyTestInstance,
  dropTable,
  query,
  type TestDuckDB
} from './duckdb-node-helper';

const ROOT = join(process.cwd(), 'static/tests-datasets');
const NULL_VALUES = `['', ':', '-', 'null', 'NULL', 'NA', 'N/A', 'n/a', '#N/A', 'NaN', 'nil', 'NIL', 'none', 'NONE', 'None']`;

describe('tabular numeric normalization integration', () => {
  let db: TestDuckDB;

  beforeAll(async () => {
    db = await createTestInstance();
  }, 60_000);

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('promotes formatted numeric text columns on the european fixture', async () => {
    const tableName = 'csv_eu_numeric_norm';
    const filePath = join(
      ROOT,
      'csv/csv-malformed--with-european-numeric-format.csv'
    );

    await db.connection.run(
      `CREATE OR REPLACE TABLE "${tableName}" AS
       FROM read_csv('${filePath}', header=true, decimal_separator=',', normalize_names=true, nullstr=${NULL_VALUES})`
    );

    const before = await query(db, `FROM describe_full('${tableName}')`);
    const beforeTypes = Object.fromEntries(
      before.map((row) => [row.name as string, row.type_simple as string])
    );

    expect(beforeTypes.population).toBe('string');
    expect(beforeTypes.gdp_billion).toBe('string');
    expect(beforeTypes.temperature).toBe('string');

    const duck = {
      query: async (
        sql: string,
        options?: { format?: string }
      ): Promise<unknown> => {
        if (options?.format === 'array') {
          return query(db, sql);
        }
        await db.connection.run(sql);
        return [];
      }
    };

    const converted = await normalizeFormattedNumericColumns(tableName, duck);
    const after = await query(db, `FROM describe_full('${tableName}')`);
    const afterTypes = Object.fromEntries(
      after.map((row) => [row.name as string, row.type_simple as string])
    );

    expect(converted).toContain('population');
    expect(converted).toContain('gdp_billion');
    expect(converted).toContain('temperature');
    expect(afterTypes.population).toBe('numeric');
    expect(afterTypes.gdp_billion).toBe('numeric');
    expect(afterTypes.temperature).toBe('numeric');

    await dropTable(db, tableName);
  });
});
