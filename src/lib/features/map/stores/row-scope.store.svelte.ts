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
}

interface LoadedRowScope {
  clause: string;
  rowIds: Set<number>;
}

const EVERY_PRIMITIVE_KEY = 'all';

function buildScopeKey(
  visualizationId: string,
  primitive: PrimitiveFilter | undefined
): string {
  return `${visualizationId}|${primitive ?? EVERY_PRIMITIVE_KEY}`;
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

  async function sync(targets: RowScopeTarget[]): Promise<void> {
    const thisGeneration = ++generation;
    const queries = new Map<
      string,
      { tableName: string; clause: string; keys: string[] }
    >();
    const seenKeys = new Set<string>();

    for (const target of targets) {
      const key = buildScopeKey(target.visualizationId, target.primitive);
      seenKeys.add(key);

      const scope = resolveRowScope(target);
      if (!scope?.clause) {
        if (scopes.delete(key)) {
          version += 1;
        }
        continue;
      }

      if (scopes.get(key)?.clause === scope.clause) {
        continue;
      }

      // Primitives without filters of their own share the table-wide clause,
      // so the common case resolves to a single query per dataset.
      const queryKey = `${scope.tableName} ${scope.clause}`;
      const existing = queries.get(queryKey);
      if (existing) {
        existing.keys.push(key);
        continue;
      }
      queries.set(queryKey, {
        tableName: scope.tableName,
        clause: scope.clause,
        keys: [key]
      });
    }

    for (const key of [...scopes.keys()]) {
      if (!seenKeys.has(key) && scopes.delete(key)) {
        version += 1;
      }
    }

    for (const query of queries.values()) {
      try {
        const rowIds = await duckDBOrchestrator.getRowIdsInScope(
          query.tableName,
          query.clause
        );

        if (thisGeneration !== generation) {
          return;
        }

        for (const key of query.keys) {
          scopes.set(key, { clause: query.clause, rowIds });
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
    sync,
    clear
  };
}

export const rowScopeStore = createRowScopeStore();
