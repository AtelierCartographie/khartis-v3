import {
  buildFilterClause,
  buildFilterWhereClause,
  combineFilterClauses,
  duckDBOrchestrator
} from '$lib/features/duckdb';
import type { DataTableFilterInput } from '$lib/features/duckdb';
import type {
  PrimitiveFilter,
  VizDataFilter
} from '../stores/visualization.types';
import { selectVizFiltersForPrimitive } from '../utils/viz-filter.utils';

export interface RowScope {
  tableName: string;
  clause: string | null;
}

export interface RowScopeRequest {
  datasetId: string;
  vizFilters?: VizDataFilter[];
  primitive?: PrimitiveFilter;
}

function toFilterInput(
  filter: VizDataFilter,
  columnTypes: Map<string, string>
): DataTableFilterInput {
  return {
    column: filter.column,
    columnType: columnTypes.get(filter.column) ?? null,
    operator: filter.operator,
    value: filter.value,
    secondaryValue: filter.secondaryValue,
    limit: filter.limit
  };
}

export function resolveRowScope(request: RowScopeRequest): RowScope | null {
  const dataset = duckDBOrchestrator.getDatasetBySourceFile(request.datasetId);
  if (!dataset?.tableName) {
    return null;
  }

  const vizFilters = selectVizFiltersForPrimitive(
    request.vizFilters,
    request.primitive
  );
  const columnTypes = new Map(
    (dataset.columns ?? []).map((column) => [column.name, column.type_simple])
  );

  return {
    tableName: dataset.tableName,
    clause: combineFilterClauses([
      buildFilterWhereClause(duckDBOrchestrator.getFilters(dataset.tableName)),
      buildFilterClause(
        dataset.tableName,
        vizFilters.map((filter) => toFilterInput(filter, columnTypes))
      )
    ])
  };
}

export function resolveRowScopeClause(request: RowScopeRequest): string | null {
  return resolveRowScope(request)?.clause ?? null;
}
