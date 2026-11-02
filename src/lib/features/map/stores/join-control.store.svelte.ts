import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  duckDBOrchestrator,
  type JoinTerritoryStatus,
  type JoinTerritoryStatusRow
} from '$lib/features/duckdb';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { getLocale } from '$lib/paraglide/runtime';
import type { BasemapMetadata } from '../types/basemap.types';

export interface JoinControlRequest {
  datasetId: string;
  orchestratorDatasetId: string;
  /** The finalized table as the map holds it: a new one means a new join. */
  datasetTable: ArrowTable;
  basemap: BasemapMetadata;
  geoColumn: string;
  excludedValues: string[];
}

export interface JoinControlStatuses {
  datasetId: string;
  rows: JoinTerritoryStatusRow[];
}

export type JoinControlCounts = Record<JoinTerritoryStatus, number>;

const tableIdentities = new WeakMap<ArrowTable, number>();
let nextTableIdentity = 0;

function getTableIdentity(table: ArrowTable): number {
  let identity = tableIdentities.get(table);
  if (identity === undefined) {
    identity = nextTableIdentity++;
    tableIdentities.set(table, identity);
  }
  return identity;
}

function buildRequestKey(request: JoinControlRequest): string {
  return JSON.stringify([
    request.datasetId,
    getTableIdentity(request.datasetTable),
    request.basemap.file,
    request.geoColumn,
    [...request.excludedValues].sort(),
    getLocale()
  ]);
}

function areCountsEqual(
  left: JoinControlCounts | null,
  right: JoinControlCounts | null
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (Object.keys(left) as JoinTerritoryStatus[]).every(
    (status) => left[status] === right[status]
  );
}

function createJoinControlStore() {
  let statuses = $state.raw<JoinControlStatuses | null>(null);
  let counts = $state.raw<JoinControlCounts | null>(null);
  let focusedStatus = $state<JoinTerritoryStatus | null>(null);
  let version = $state(0);
  let loadedKey: string | null = null;
  let pendingKey: string | null = null;

  async function load(request: JoinControlRequest, key: string) {
    try {
      const rows = await duckDBOrchestrator.getJoinTerritoryStatuses(
        request.orchestratorDatasetId,
        request.basemap,
        request.geoColumn,
        { excludedValues: request.excludedValues }
      );
      if (pendingKey !== key) return;
      statuses = { datasetId: request.datasetId, rows };
    } catch (error) {
      if (pendingKey !== key) return;
      // The map falls back to the neutral preview; the join panel still
      // reports every bucket.
      logger.error('Failed to grade the joined territories', LogCategory.MAP, {
        datasetId: request.datasetId,
        basemap: request.basemap.file,
        error
      });
      statuses = null;
    }
    loadedKey = key;
    pendingKey = null;
    version++;
  }

  /**
   * The statuses of the requested join, or the previous ones of the same
   * dataset while the new ones load: a refinalized join keeps its colors
   * instead of flashing grey.
   */
  function request(next: JoinControlRequest): JoinControlStatuses | null {
    const key = buildRequestKey(next);
    if (key !== loadedKey && key !== pendingKey) {
      pendingKey = key;
      void load(next, key);
    }
    return statuses?.datasetId === next.datasetId ? statuses : null;
  }

  function publishCounts(next: JoinControlCounts | null): void {
    if (areCountsEqual(counts, next)) return;
    counts = next;
  }

  function setFocusedStatus(status: JoinTerritoryStatus | null): void {
    if (focusedStatus === status) return;
    focusedStatus = status;
    version++;
  }

  return {
    get counts(): JoinControlCounts | null {
      return counts;
    },
    get focusedStatus(): JoinTerritoryStatus | null {
      return focusedStatus;
    },
    get version(): number {
      return version;
    },
    request,
    publishCounts,
    setFocusedStatus
  };
}

export const joinControlStore = createJoinControlStore();
