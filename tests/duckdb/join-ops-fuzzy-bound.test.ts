import { describe, expect, it } from 'vitest';
import {
  computeJoinSynthesis,
  invalidateSimilarityCache,
  type DuckDBClientForJoin
} from '$lib/features/duckdb/orchestrator/join-ops';
import type { DuckDBDataset } from '$lib/features/duckdb/types';

describe('join-ops similarity cache', () => {
  it('bounds fuzzy matching when many source values remain unmatched', async () => {
    const queries: string[] = [];
    const Duck: DuckDBClientForJoin = {
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes("table_name = 'basemap_attributes'")) {
          return [{ table_name: 'basemap_attributes' }];
        }
        return [];
      },
      async join_by_id() {
        return [];
      },
      async apply_join_association() {
        return [];
      }
    };
    const dataset = {
      tableName: 'large_join_source'
    } as DuckDBDataset;

    invalidateSimilarityCache(dataset.tableName);
    await computeJoinSynthesis(dataset, 'geo_code', Duck);

    const cacheQuery = queries.find((sql) =>
      sql.includes('CREATE OR REPLACE TEMP TABLE')
    );
    expect(cacheQuery).toContain('unmatched_count AS');
    expect(cacheQuery).toContain('bounded_unmatched');
    expect(cacheQuery).toContain('SELECT COUNT(*) AS count FROM unmatched');
    expect(cacheQuery).toContain('WHERE c.count <=');
  });

  it('caps exact matches per source value and basemap', async () => {
    const queries: string[] = [];
    const Duck: DuckDBClientForJoin = {
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes("table_name = 'basemap_attributes'")) {
          return [{ table_name: 'basemap_attributes' }];
        }
        return [];
      },
      async join_by_id() {
        return [];
      },
      async apply_join_association() {
        return [];
      }
    };
    const dataset = {
      tableName: 'department_code_source'
    } as DuckDBDataset;

    invalidateSimilarityCache(dataset.tableName);
    await computeJoinSynthesis(dataset, 'department_code', Duck);

    const cacheQuery = queries.find((sql) =>
      sql.includes('CREATE OR REPLACE TEMP TABLE')
    );
    expect(cacheQuery).toContain('exact_raw AS');
    expect(cacheQuery).toContain('PARTITION BY c.original_name, ba.basemap');
    expect(cacheQuery).toContain('WHERE exact_rank <=');
  });
});
