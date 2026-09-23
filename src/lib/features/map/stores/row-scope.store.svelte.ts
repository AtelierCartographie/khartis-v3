import { SvelteMap } from 'svelte/reactivity';
import {
  combineFilterClauses,
  duckDBOrchestrator,
  type MissingValueColumn
} from '$lib/features/duckdb';
import { JOINED_BASEMAP_COLUMN } from '$lib/features/commons/constants/data.constants';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import {
  resolveRowScope,
  type RowScopeRequest
} from '$lib/features/commons/services/row-scope.service';
import type { PrimitiveFilter } from '$lib/features/commons/stores/visualization.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export interface RowScopeTarget extends RowScopeRequest {
  visualizationId: string;
  numericColumns?: string[];
  missingDataColumns?: MissingValueColumn[];
}

export interface ColumnDomain {
  min: number;
  max: number;
}

interface LoadedRowScope {
  key: string;
  rowIds: Set<number>;
  domains: Map<string, ColumnDomain>;
}

interface LoadedMissingData {
  key: string;
  hasMissingData: boolean;
}

interface PendingMissingDataQuery {
  tableName: string;
  clause: string | null;
  columns: MissingValueColumn[];
  scopeKeys: string[];
}

interface PendingQuery {
  tableName: string;
  clause: string;
  columns: string[];
  scopeKeys: string[];
}

const EVERY_PRIMITIVE_KEY = 'all';

function buildScopeKey(
  visualizationId: string,
  primitive: PrimitiveFilter | undefined
): string {
  return `${visualizationId}|${primitive ?? EVERY_PRIMITIVE_KEY}`;
}

function buildLoadKey(
  tableName: string,
  clause: string,
  columns: string[]
): string {
  return [tableName, clause, ...columns].join(' ');
}

function buildMissingDataLoadKey(
  tableName: string,
  clause: string | null,
  columns: MissingValueColumn[]
): string {
  return [
    tableName,
    clause ?? '',
    ...columns.map(({ column, numeric }) => `${numeric ? 'n' : 't'}:${column}`)
  ].join(' ');
}

// Entities left unjoined never reach the map, so their values cannot be missing
// from it.
function resolveDisplayedRowsClause(datasetId: string): string | null {
  const dataset = duckDBOrchestrator.getDatasetBySourceFile(datasetId);
  const isJoinedToBasemap =
    !dataset?.gpsMode &&
    Boolean(dataset?.joinedBasemap) &&
    Boolean(
      dataset?.columns.some(
        (column) => column.name === JOINED_BASEMAP_COLUMN.ID
      )
    );

  return isJoinedToBasemap
    ? `"${escapeIdentifier(JOINED_BASEMAP_COLUMN.ID)}" IS NOT NULL`
    : null;
}

function createRowScopeStore() {
  const scopes = new SvelteMap<string, LoadedRowScope>();
  const missingData = new SvelteMap<string, LoadedMissingData>();
  // Layer rebuilds are driven by explicit versions, and resolving a scope is
  // asynchronous: without this the layers rebuild before the row ids land.
  let version = $state(0);
  let generation = 0;

  function getScopedRowIds(
    visualizationId: string,
    primitive: PrimitiveFilter | undefined
  ): Set<number> | null {
    return (
      scopes.get(buildScopeKey(visualizationId, primitive))?.rowIds ?? null
    );
  }

  function getScopedDomain(
    visualizationId: string,
    primitive: PrimitiveFilter | undefined,
    column: string | undefined
  ): ColumnDomain | null {
    if (!column) {
      return null;
    }

    return (
      scopes
        .get(buildScopeKey(visualizationId, primitive))
        ?.domains.get(column) ?? null
    );
  }

  function hasMissingData(
    visualizationId: string,
    primitive: PrimitiveFilter
  ): boolean {
    return (
      missingData.get(buildScopeKey(visualizationId, primitive))
        ?.hasMissingData ?? false
    );
  }

  function collectMissingDataQueries(
    targets: RowScopeTarget[]
  ): PendingMissingDataQuery[] {
    const queries = new Map<string, PendingMissingDataQuery>();
    const seenScopeKeys = new Set<string>();

    for (const target of targets) {
      const columns = target.missingDataColumns ?? [];
      const scope = columns.length > 0 ? resolveRowScope(target) : null;
      if (!scope) {
        continue;
      }

      const scopeKey = buildScopeKey(target.visualizationId, target.primitive);
      seenScopeKeys.add(scopeKey);

      const clause = combineFilterClauses([
        scope.clause ? `(${scope.clause})` : null,
        resolveDisplayedRowsClause(target.datasetId)
      ]);
      const loadKey = buildMissingDataLoadKey(scope.tableName, clause, columns);
      if (missingData.get(scopeKey)?.key === loadKey) {
        continue;
      }

      const pending = queries.get(loadKey);
      if (pending) {
        pending.scopeKeys.push(scopeKey);
        continue;
      }
      queries.set(loadKey, {
        tableName: scope.tableName,
        clause,
        columns,
        scopeKeys: [scopeKey]
      });
    }

    for (const scopeKey of [...missingData.keys()]) {
      if (!seenScopeKeys.has(scopeKey)) {
        missingData.delete(scopeKey);
      }
    }

    return [...queries.values()];
  }

  async function syncMissingData(
    targets: RowScopeTarget[],
    thisGeneration: number
  ): Promise<void> {
    for (const query of collectMissingDataQueries(targets)) {
      try {
        const counts = await duckDBOrchestrator.getMissingValueCountsInScope(
          query.tableName,
          query.clause,
          query.columns
        );

        if (thisGeneration !== generation) {
          return;
        }

        const key = buildMissingDataLoadKey(
          query.tableName,
          query.clause,
          query.columns
        );
        const loaded = {
          key,
          hasMissingData: counts.some((count) => count > 0)
        };
        for (const scopeKey of query.scopeKeys) {
          missingData.set(scopeKey, loaded);
        }
      } catch (error) {
        logger.error('Failed to count missing data', LogCategory.MAP, {
          tableName: query.tableName,
          error
        });
      }
    }
  }

  function collectQueries(targets: RowScopeTarget[]): PendingQuery[] {
    const queries = new Map<string, PendingQuery>();
    const seenScopeKeys = new Set<string>();

    for (const target of targets) {
      const scopeKey = buildScopeKey(target.visualizationId, target.primitive);
      seenScopeKeys.add(scopeKey);

      const scope = resolveRowScope(target);
      if (!scope?.clause) {
        if (scopes.delete(scopeKey)) {
          version += 1;
        }
        continue;
      }

      const columns = [...new Set(target.numericColumns ?? [])].sort();
      const loadKey = buildLoadKey(scope.tableName, scope.clause, columns);
      if (scopes.get(scopeKey)?.key === loadKey) {
        continue;
      }

      // Primitives without filters of their own share the table-wide clause,
      // so the common case resolves to a single query per dataset.
      const pending = queries.get(loadKey);
      if (pending) {
        pending.scopeKeys.push(scopeKey);
        continue;
      }
      queries.set(loadKey, {
        tableName: scope.tableName,
        clause: scope.clause,
        columns,
        scopeKeys: [scopeKey]
      });
    }

    for (const scopeKey of [...scopes.keys()]) {
      if (!seenScopeKeys.has(scopeKey) && scopes.delete(scopeKey)) {
        version += 1;
      }
    }

    return [...queries.values()];
  }

  async function sync(targets: RowScopeTarget[]): Promise<void> {
    const thisGeneration = ++generation;
    const missingDataSync = syncMissingData(targets, thisGeneration);

    for (const query of collectQueries(targets)) {
      try {
        const [rowIds, domains] = await Promise.all([
          duckDBOrchestrator.getRowIdsInScope(query.tableName, query.clause),
          duckDBOrchestrator.getColumnDomainsInScope(
            query.tableName,
            query.clause,
            query.columns
          )
        ]);

        if (thisGeneration !== generation) {
          break;
        }

        const key = buildLoadKey(query.tableName, query.clause, query.columns);
        for (const scopeKey of query.scopeKeys) {
          scopes.set(scopeKey, { key, rowIds, domains });
        }
        version += 1;
      } catch (error) {
        logger.error('Failed to resolve filtered row scope', LogCategory.MAP, {
          tableName: query.tableName,
          error
        });
      }
    }

    await missingDataSync;
  }

  function clear(): void {
    generation += 1;
    missingData.clear();
    if (scopes.size > 0) {
      scopes.clear();
      version += 1;
    }
  }

  return {
    get version(): number {
      return version;
    },
    getScopedRowIds,
    getScopedDomain,
    hasMissingData,
    sync,
    clear
  };
}

export const rowScopeStore = createRowScopeStore();
