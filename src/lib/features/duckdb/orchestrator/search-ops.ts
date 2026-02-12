import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { SearchStats } from '../types';

export interface DuckDBClientForSearch {
  searchInTable(
    tableName: string,
    query: string,
    options?: { threshold?: number; column?: string }
  ): Promise<SearchStats>;
}

export async function searchInTable(
  tableName: string,
  query: string,
  Duck: DuckDBClientForSearch | null,
  options: { threshold?: number; column?: string } = {}
): Promise<SearchStats> {
  const emptyResult: SearchStats = {
    exactCount: 0,
    containsCount: 0,
    fuzzyCount: 0,
    totalCount: 0,
    results: []
  };

  if (!Duck) {
    logger.warn('DuckDB not initialized for search', LogCategory.DUCKDB);
    return emptyResult;
  }

  return Duck.searchInTable(tableName, query, options);
}
