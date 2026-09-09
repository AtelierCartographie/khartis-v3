import { SvelteMap } from 'svelte/reactivity';
import { duckDBOrchestrator } from '$lib/features/duckdb';
import {
  resolveRowScope,
  type RowScopeRequest
} from '$lib/features/commons/services/row-scope.service';
import type { PrimitiveFilter } from '$lib/features/commons/stores/visualization.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

export interface RowScopeTarget extends RowScopeRequest {
  visualizationId: string;
  numericColumns?: string[];
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

function createRowScopeStore() {
  const scopes = new SvelteMap<string, LoadedRowScope>();
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
          return;
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
  }

  function clear(): void {
    generation += 1;
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
    sync,
    clear
  };
}

export const rowScopeStore = createRowScopeStore();
