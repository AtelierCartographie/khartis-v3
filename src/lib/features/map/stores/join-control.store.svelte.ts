import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import {
  duckDBOrchestrator,
  isMissingDuckTableError,
  type JoinTerritoryStatus,
  type JoinTerritoryStatusRow
} from '$lib/features/duckdb';
import { dataTabState } from '$lib/features/commons/stores/data-tab.store.svelte';
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
  /** The variable the finalized join was built on. */
  geoColumn: string;
  rows: JoinTerritoryStatusRow[];
}

export type JoinControlCounts = Record<JoinTerritoryStatus, number>;

/** A join panel category, or the territories left without data. */
export type JoinControlCategory =
  JoinTerritoryStatus | 'unrecognized' | 'ignored';

export type JoinPanelCategory = Exclude<JoinControlCategory, 'no_data'>;

export interface JoinPanelRequest {
  id: number;
  /** `null` brings the join panel itself into view. */
  category: JoinPanelCategory | null;
  open: boolean;
}

/** Source values or row ids whose territories the map outlines. */
export interface JoinControlHoverTarget {
  values?: string[];
  rowIds?: number[];
}

const TERRITORY_STATUSES = new Set<JoinControlCategory>([
  'matched',
  'check',
  'duplicate',
  'no_data'
]);

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
  let activeCategory = $state<JoinControlCategory | null>(null);
  let panelRequest = $state.raw<JoinPanelRequest | null>(null);
  let hoverTarget = $state.raw<JoinControlHoverTarget | null>(null);
  let version = $state(0);
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
        { excludedValues: request.excludedValues }
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

  function publishCounts(next: JoinControlCounts | null): void {
    if (areCountsEqual(counts, next)) return;
    counts = next;
  }

  function toFocusedStatus(
    category: JoinControlCategory | null
  ): JoinTerritoryStatus | null {
    return category && TERRITORY_STATUSES.has(category)
      ? (category as JoinTerritoryStatus)
      : null;
  }

  /** The open category; a territory status also highlights the map. */
  function setActiveCategory(category: JoinControlCategory | null): void {
    if (activeCategory === category) return;
    const redraws =
      toFocusedStatus(activeCategory) !== toFocusedStatus(category);
    activeCategory = category;
    if (redraws) version++;
  }

  /** Asks the join panel to open or close one of its categories. */
  function requestPanelCategory(
    category: JoinPanelCategory,
    open: boolean
  ): void {
    panelRequest = { id: (panelRequest?.id ?? 0) + 1, category, open };
  }

  function requestPanelSection(): void {
    panelRequest = {
      id: (panelRequest?.id ?? 0) + 1,
      category: null,
      open: true
    };
  }

  function setHoverTarget(next: JoinControlHoverTarget | null): void {
    if (!next && !hoverTarget) return;
    hoverTarget = next;
  }

  return {
    get counts(): JoinControlCounts | null {
      return counts;
    },
    get activeCategory(): JoinControlCategory | null {
      return activeCategory;
    },
    get focusedStatus(): JoinTerritoryStatus | null {
      return toFocusedStatus(activeCategory);
    },
    get panelRequest(): JoinPanelRequest | null {
      return panelRequest;
    },
    get hoverTarget(): JoinControlHoverTarget | null {
      return hoverTarget;
    },
    /**
     * Changes whenever the join-control layers must be redrawn, including when
     * the join panel links another variable.
     */
    get renderKey(): string {
      return `${version}:${dataTabState.geolocation.linkedVariableName}`;
    },
    request,
    publishCounts,
    setActiveCategory,
    requestPanelCategory,
    requestPanelSection,
    setHoverTarget
  };
}

export const joinControlStore = createJoinControlStore();
