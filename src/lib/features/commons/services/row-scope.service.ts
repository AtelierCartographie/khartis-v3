import {
  buildFilterClause,
  buildFilterWhereClause,
  combineFilterClauses,
  duckDBOrchestrator
} from '$lib/features/duckdb';
import type { DataTableFilterInput, DuckDBDataset } from '$lib/features/duckdb';
import { JOINED_BASEMAP_COLUMN } from '../constants/data.constants';
import { escapeIdentifier } from '../utils/sanitize.utils';
import type {
  PrimitiveFilter,
  VizDataFilter
} from '../stores/visualization.types';
import { selectVizFiltersForPrimitive } from '../utils/viz-filter.utils';

export interface RowScope {
  tableName: string;
  clause: string | null;
  valueClause: string | null;
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

// Rows left unjoined never reach the map, so they must not weigh on its breaks,
// domains or missing-data count either.
function resolveJoinedRowsClause(dataset: DuckDBDataset): string | null {
  return dataset.hasJoinKey
    ? `"${escapeIdentifier(JOINED_BASEMAP_COLUMN.ID)}" IS NOT NULL`
    : null;
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

  const clause = combineFilterClauses([
    buildFilterWhereClause(duckDBOrchestrator.getFilters(dataset.tableName)),
    buildFilterClause(
      dataset.tableName,
      vizFilters.map((filter) => toFilterInput(filter, columnTypes))
    )
  ]);

  return {
    tableName: dataset.tableName,
    clause,
    valueClause: combineFilterClauses([
      clause ? `(${clause})` : null,
      resolveJoinedRowsClause(dataset)
    ])
  };
}

export function resolveRowScopeClause(request: RowScopeRequest): string | null {
  return resolveRowScope(request)?.clause ?? null;
}

export function resolveValueScopeClause(
  request: RowScopeRequest
): string | null {
  return resolveRowScope(request)?.valueClause ?? null;
}
