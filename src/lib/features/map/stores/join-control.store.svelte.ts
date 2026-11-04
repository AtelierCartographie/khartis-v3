import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  duckDBOrchestrator,
  isMissingDuckTableError,
  type JoinTerritoryStatus,
  type JoinTerritoryStatusRow
} from '$lib/features/duckdb';
import { dataTabState } from '$lib/features/commons/stores/data-tab.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { motionDuration } from '$lib/features/commons/utils/step-transition.svelte';
import { getLocale } from '$lib/paraglide/runtime';
import type { BasemapMetadata } from '../types/basemap.types';
import { buildPendingJoinMappings } from '../utils/join-control.utils';

export interface JoinControlRequest {
  datasetId: string;
  orchestratorDatasetId: string;
  /** The finalized table as the map holds it: a new one means a new join. */
  datasetTable: ArrowTable;
  basemap: BasemapMetadata;
  geoColumn: string;
  excludedValues: string[];
  /** Basemap values the ignored source values were matched to. */
  ignoredBasemapValues: string[];
  /**
   * Associations picked in the join panel and not applied yet, by source
   * value; an empty value leaves its source value unjoined.
   */
  pendingMappings: Record<string, string>;
}

export interface JoinControlStatuses {
  datasetId: string;
  /** The variable the finalized join was built on. */
  geoColumn: string;
  rows: JoinTerritoryStatusRow[];
}

export type JoinControlCounts = Record<JoinTerritoryStatus, number>;

/** A join panel category, or the territories left without data. */
export type JoinControlCategory = JoinTerritoryStatus | 'unrecognized';

export type JoinPanelCategory = Exclude<JoinControlCategory, 'no_data'>;

/** Source values or row ids whose territories the map outlines. */
export interface JoinControlHoverTarget {
  values?: string[];
  rowIds?: number[];
}

const REVEAL_COMPLETION_MS = 1500;

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
    [...request.ignoredBasemapValues].sort(),
    Object.entries(request.pendingMappings).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
    getLocale()
  ]);
}

function createJoinControlStore() {
  let statuses = $state.raw<JoinControlStatuses | null>(null);
  let hoverTarget = $state.raw<JoinControlHoverTarget | null>(null);
  // Joined values whose association the user cleared in the join panel: they
  // are no longer joined, and the dataset cannot be visualized until each one
  // gets an entity or is ignored.
  let clearedJoins = $state.raw<{ datasetId: string; values: Set<string> }>({
    datasetId: '',
    values: new Set()
  });
  let version = $state(0);
  // The join appears on the map once the user reaches the join step, and
  // stays for the session; it fades in the first time it is drawn.
  let revealedDatasetIds = $state.raw(new Set<string>());
  let revealing = $state.raw<{ datasetId: string; progress: number } | null>(
    null
  );
  const completingDatasetIds = new Set<string>();
  let loadedKey: string | null = null;
  let pendingKey: string | null = null;

  async function load(request: JoinControlRequest, key: string) {
    const tableName = duckDBOrchestrator.findDatasetByIdOrSourceFile(
      request.orchestratorDatasetId
    )?.tableName;
    try {
      const rows = await duckDBOrchestrator.getJoinTerritoryStatuses(
        request.orchestratorDatasetId,
        request.basemap,
        request.geoColumn,
        {
          excludedValues: request.excludedValues,
          ignoredBasemapValues: request.ignoredBasemapValues,
          pendingMappings: request.pendingMappings
        }
      );
      if (pendingKey !== key) return;
      statuses = {
        datasetId: request.datasetId,
        geoColumn: request.geoColumn,
        rows
      };
    } catch (error) {
      if (pendingKey !== key) return;
      // A project switch can drop the table under a pending request.
      const isDatasetGone =
        isMissingDuckTableError(error) &&
        (!tableName || !duckDBOrchestrator.getDatasetByTable(tableName));
      // The map falls back to the neutral preview; the join panel still
      // reports every bucket.
      if (!isDatasetGone) {
        logger.error(
          'Failed to grade the joined territories',
          LogCategory.MAP,
          {
            datasetId: request.datasetId,
            basemap: request.basemap.file,
            error
          }
        );
      }
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

  function getRevealProgress(datasetId: string): number {
    if (revealedDatasetIds.has(datasetId)) return 1;
    return revealing?.datasetId === datasetId ? revealing.progress : 0;
  }

  /**
   * Follows the scroll towards the join panel: the join only grows more
   * visible, and once whole it stays for the session.
   */
  function setRevealProgress(datasetId: string, progress: number): void {
    const previous = getRevealProgress(datasetId);
    const next = Math.min(1, Math.max(previous, progress));
    if (next === previous) return;
    if (next >= 1) {
      revealedDatasetIds = new Set(revealedDatasetIds).add(datasetId);
      revealing = null;
    } else {
      revealing = { datasetId, progress: next };
    }
    if (previous === 0) version++;
  }

  /** Ends the reveal on its own when the panel cannot scroll any further. */
  function completeReveal(datasetId: string): void {
    const from = getRevealProgress(datasetId);
    if (from >= 1 || completingDatasetIds.has(datasetId)) return;
    const duration = motionDuration(REVEAL_COMPLETION_MS) * (1 - from);
    if (duration === 0 || typeof requestAnimationFrame !== 'function') {
      setRevealProgress(datasetId, 1);
      return;
    }
    completingDatasetIds.add(datasetId);
    const start = performance.now();
    const step = (now: number) => {
      const progress = from + ((1 - from) * (now - start)) / duration;
      setRevealProgress(datasetId, progress);
      if (progress < 1) requestAnimationFrame(step);
      else completingDatasetIds.delete(datasetId);
    };
    requestAnimationFrame(step);
  }

  function getClearedValues(datasetId: string): ReadonlySet<string> {
    return clearedJoins.datasetId === datasetId
      ? clearedJoins.values
      : new Set<string>();
  }

  function setJoinCleared(
    datasetId: string,
    dataValue: string,
    cleared: boolean
  ): void {
    const values = new Set(getClearedValues(datasetId));
    if (values.has(dataValue) === cleared) return;
    if (cleared) values.add(dataValue);
    else values.delete(dataValue);
    clearedJoins = { datasetId, values };
  }

  function setHoverTarget(next: JoinControlHoverTarget | null): void {
    if (!next && !hoverTarget) return;
    hoverTarget = next;
  }

  return {
    get hoverTarget(): JoinControlHoverTarget | null {
      return hoverTarget;
    },
    /**
     * Changes whenever the join-control layers must be redrawn, including when
     * the join panel links another variable, geolocates by coordinates or
     * holds an association not applied yet.
     */
    get renderKey(): string {
      const { geoReference, linkedVariableName } = dataTabState.geolocation;
      const pending = buildPendingJoinMappings(
        dataTabState.basemapJoin.joinMappings,
        clearedJoins.values
      );
      return `${version}:${geoReference}:${linkedVariableName}:${JSON.stringify(pending)}`;
    },
    request,
    getClearedValues,
    setJoinCleared,
    setHoverTarget,
    getRevealProgress,
    setRevealProgress,
    completeReveal
  };
}

export const joinControlStore = createJoinControlStore();
