import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { DatasetResult } from '$lib/features/data-pipeline';
import {
  Duck,
  type JoinFuzzyPassEstimate,
  type JoinTarget
} from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import type { JoinQuality } from '$lib/features/map/types/basemap.types';
import type {
  JoinedEntity,
  JoinMapping
} from '$lib/features/commons/types/data-tab.types';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { refreshDatasetMetadata } from '../services/dataset-metadata.service';
import { persistEnrichedSourceFile } from '../services/source-file-state.service';
import { JOINED_BASEMAP_COLUMNS } from '$lib/features/commons/constants/data.constants';
import { dataTabActions } from '$lib/features/commons/stores/data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import * as m from '$lib/paraglide/messages';

export const ENRICHMENT_JOINED_PAGE_SIZE = 100;

export interface UseEnrichmentJoinProps {
  getEnrichmentDataset: () => DatasetResult | null;
  getEnrichLinkedVariableId: () => number | undefined;
  getGeoFileColumnId: () => number | undefined;
  getEnrichDataFieldItems: () => Array<{ id: number; columnName: string }>;
  getGeoFileColumns: () => Array<{ id: number; columnName: string }>;
  isJoinBlocked?: () => boolean;
  onJoinFinalized: () => void;
}

/** What the assisted join section shows, corrections and exclusions applied. */
export interface EnrichmentJoinView {
  joinRows: JoinMapping[];
  duplicates: string[];
  unknowns: string[];
  joinedCount: number;
  toVerifyCount: number;
  duplicateTotal: number;
  unrecognizedTotal: number;
  duplicateLines: JoinQuality['duplicateLines'];
  ignoredEntities: Array<{ dataValue: string; lines: number[] }>;
}

export interface UseEnrichmentJoinReturn {
  readonly view: EnrichmentJoinView | null;
  readonly isComputingJoin: boolean;
  readonly isFinalizingJoin: boolean;
  readonly targetOptions: string[];
  readonly fuzzyPassEstimate: JoinFuzzyPassEstimate | null;
  readonly fuzzyPassRunning: boolean;
  readonly joinedPage: number;
  readonly joinedPageRows: JoinedEntity[];
  readonly joinedTargetValues: string[];
  computeEnrichmentJoinStats: () => Promise<void>;
  handleMappingChange: (index: number, value: string) => void;
  handleFinalizeEnrichment: () => Promise<void>;
  handleManualCorrection: (dataValue: string, targetValue: string) => void;
  validateEntity: (dataValue: string, targetValue: string) => void;
  ignoreEntity: (dataValue: string) => void;
  restoreEntity: (dataValue: string) => void;
  runFullFuzzyPass: () => Promise<void>;
  loadJoinedPage: (page: number) => void;
  requestJoinedEntities: () => void;
  resetJoinState: () => void;
}

interface JoinColumns {
  sourceTableName: string;
  sourceColumn: string;
  targetTableName: string;
  targetColumn: string;
}

export function useEnrichmentJoin(
  props: UseEnrichmentJoinProps
): UseEnrichmentJoinReturn {
  const {
    getEnrichmentDataset,
    getEnrichLinkedVariableId,
    getGeoFileColumnId,
    getEnrichDataFieldItems,
    getGeoFileColumns,
    isJoinBlocked = () => false,
    onJoinFinalized
  } = props;

  let target: JoinTarget | null = null;
  let quality = $state.raw<JoinQuality | null>(null);
  let isComputingJoin = $state(false);
  let isFinalizingJoin = $state(false);
  let targetOptions = $state.raw<string[]>([]);
  let fuzzyPassEstimate = $state.raw<JoinFuzzyPassEstimate | null>(null);
  let fuzzyPassRunning = $state(false);
  let joinedPage = $state(1);
  let joinedPageRows = $state.raw<JoinedEntity[]>([]);
  let joinedTargetValues = $state.raw<string[]>([]);
  const mappingOverrides = new SvelteMap<string, string>();
  const manualCorrections = new SvelteMap<string, string>();
  const ignoredValues = new SvelteSet<string>();
  // Only the latest run may publish: an earlier one can finish last.
  let latestRun = 0;

  const selectedDataset = $derived(datasetsStore.selectedDataset);

  function resolveJoinColumns(): JoinColumns | null {
    const enrichmentDataset = getEnrichmentDataset();
    const targetTableName = selectedDataset?.tableName;
    const sourceColumn = getEnrichDataFieldItems().find(
      (item) => item.id === getEnrichLinkedVariableId()
    )?.columnName;
    const targetColumn = getGeoFileColumns().find(
      (item) => item.id === getGeoFileColumnId()
    )?.columnName;
    if (
      !enrichmentDataset ||
      !targetTableName ||
      !sourceColumn ||
      !targetColumn
    )
      return null;
    return {
      sourceTableName: enrichmentDataset.tableName,
      sourceColumn,
      targetTableName,
      targetColumn
    };
  }

  // Corrected values are graded joined by hand, so the SQL grading leaves them
  // out along with the ignored ones.
  function getExcludedValues(): string[] {
    return [...ignoredValues, ...manualCorrections.keys()];
  }

  function clearJoinedView(): void {
    joinedPage = 1;
    joinedPageRows = [];
    joinedTargetValues = [];
  }

  async function refreshQuality(run: number): Promise<void> {
    const columns = resolveJoinColumns();
    if (!columns || !target) return;

    const nextQuality = await duckDBOrchestrator.computeTableJoinStats(
      columns.sourceTableName,
      columns.sourceColumn,
      target,
      { excludedValues: getExcludedValues() }
    );
    if (run !== latestRun) return;
    quality = nextQuality;
    clearJoinedView();
  }

  async function refreshFuzzyPassEstimate(run: number): Promise<void> {
    const columns = resolveJoinColumns();
    if (!columns || !target) return;
    try {
      const estimate = await duckDBOrchestrator.estimateTableJoinFuzzyPass(
        columns.sourceTableName,
        columns.sourceColumn,
        target
      );
      if (run === latestRun) fuzzyPassEstimate = estimate;
    } catch (error) {
      // The estimate only drives an optional call to action.
      if (run === latestRun) fuzzyPassEstimate = null;
      logger.warn('Failed to estimate the fuzzy join pass', LogCategory.DATA, {
        error
      });
    }
  }

  async function computeEnrichmentJoinStats(): Promise<void> {
    const run = ++latestRun;
    isComputingJoin = false;
    const columns = isJoinBlocked() ? null : resolveJoinColumns();
    if (!columns) {
      quality = null;
      targetOptions = [];
      fuzzyPassEstimate = null;
      clearJoinedView();
      return;
    }

    isComputingJoin = true;
    try {
      // The target table can change between two gradings (another enrichment,
      // a calculated column), so it is rebuilt on every column change.
      target = await duckDBOrchestrator.prepareTableJoinTarget({
        targetTableName: columns.targetTableName,
        targetColumn: columns.targetColumn
      });
      if (run !== latestRun) return;

      const options = await duckDBOrchestrator.getTableJoinTargetValues(target);
      if (run !== latestRun) return;
      targetOptions = options;

      await refreshQuality(run);
      await refreshFuzzyPassEstimate(run);
    } catch (error) {
      if (run !== latestRun) return;
      logger.error(
        'Failed to compute enrichment join stats',
        LogCategory.DATA,
        error
      );
      quality = null;
      targetOptions = [];
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      if (run === latestRun) {
        isComputingJoin = false;
      }
    }
  }

  async function regrade(): Promise<void> {
    const run = ++latestRun;
    try {
      await refreshQuality(run);
    } catch (error) {
      if (run !== latestRun) return;
      logger.error(
        'Failed to regrade enrichment join',
        LogCategory.DATA,
        error
      );
      showError(m.join_error_title(), m.join_error_message());
    }
  }

  async function runFullFuzzyPass(): Promise<void> {
    const columns = resolveJoinColumns();
    if (!columns || !target || fuzzyPassRunning) return;
    const run = ++latestRun;
    fuzzyPassRunning = true;
    try {
      await duckDBOrchestrator.runTableFullFuzzyPass(
        columns.sourceTableName,
        columns.sourceColumn,
        target
      );
      if (run !== latestRun) return;
      await refreshQuality(run);
      await refreshFuzzyPassEstimate(run);
    } catch (error) {
      logger.error(
        'Failed to run the full fuzzy pass',
        LogCategory.DATA,
        error
      );
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      fuzzyPassRunning = false;
    }
  }

  const view = $derived.by((): EnrichmentJoinView | null => {
    if (!quality) return null;
    return {
      joinRows: quality.joinMappings.map((mapping) => {
        const override = mappingOverrides.get(mapping.dataValue);
        return override === undefined
          ? mapping
          : { ...mapping, selectedMapping: override };
      }),
      duplicates: quality.duplicateEntities,
      unknowns: quality.unrecognizedEntities,
      joinedCount: quality.joinedCount + manualCorrections.size,
      toVerifyCount: quality.toVerifyCount,
      duplicateTotal: quality.duplicateCount,
      unrecognizedTotal: quality.unrecognizedCount,
      duplicateLines: quality.duplicateLines,
      ignoredEntities: [...ignoredValues].map((dataValue) => ({
        dataValue,
        lines: []
      }))
    };
  });

  /**
   * Hand-corrected values lead the joined bucket, the graded ones follow, so a
   * page is a slice of that concatenation.
   */
  async function loadJoinedPage(page: number): Promise<void> {
    const columns = resolveJoinColumns();
    if (!columns || !target) return;
    const run = latestRun;
    const corrected: JoinedEntity[] = [...manualCorrections].map(
      ([dataValue, basemapValue]) => ({ dataValue, basemapValue })
    );
    const start = (page - 1) * ENRICHMENT_JOINED_PAGE_SIZE;
    const end = start + ENRICHMENT_JOINED_PAGE_SIZE;
    const gradedOffset = Math.max(0, start - corrected.length);
    const gradedLimit = Math.max(0, end - Math.max(start, corrected.length));
    const excludedValues = getExcludedValues();

    try {
      const [rows, values] = await Promise.all([
        gradedLimit > 0
          ? duckDBOrchestrator.getTableJoinedEntitiesPage(
              columns.sourceTableName,
              columns.sourceColumn,
              target,
              { offset: gradedOffset, limit: gradedLimit, excludedValues }
            )
          : Promise.resolve([]),
        duckDBOrchestrator.getTableJoinedTargetValues(
          columns.sourceTableName,
          columns.sourceColumn,
          target,
          { excludedValues }
        )
      ]);
      if (run !== latestRun) return;
      joinedPage = page;
      joinedPageRows = [...corrected.slice(start, end), ...rows];
      joinedTargetValues = [...values, ...manualCorrections.values()];
    } catch (error) {
      logger.error(
        'Failed to load joined enrichment entities',
        LogCategory.DATA,
        error
      );
    }
  }

  function requestJoinedEntities(): void {
    if ((view?.joinedCount ?? 0) > 0 && joinedPageRows.length === 0) {
      void loadJoinedPage(1);
    }
  }

  function handleMappingChange(index: number, value: string): void {
    const mapping = quality?.joinMappings[index];
    if (!mapping) return;
    mappingOverrides.set(mapping.dataValue, value);
  }

  function handleManualCorrection(
    dataValue: string,
    targetValue: string
  ): void {
    if (!dataValue || !targetValue) return;
    manualCorrections.set(dataValue, targetValue);
    ignoredValues.delete(dataValue);
    void regrade();
  }

  function validateEntity(dataValue: string, targetValue: string): void {
    handleManualCorrection(dataValue, targetValue);
  }

  function ignoreEntity(dataValue: string): void {
    if (!dataValue || ignoredValues.has(dataValue)) return;
    ignoredValues.add(dataValue);
    manualCorrections.delete(dataValue);
    void regrade();
  }

  function restoreEntity(dataValue: string): void {
    if (!ignoredValues.delete(dataValue)) return;
    void regrade();
  }

  /**
   * Hand corrections, then the selected suggestion of every value left to
   * verify: the join applies what the section shows.
   */
  function collectCorrections(): Record<string, string> {
    const corrections: Record<string, string> = {};
    for (const mapping of view?.joinRows ?? []) {
      if (
        mapping.selectedMapping &&
        mapping.selectedMapping !== mapping.dataValue
      ) {
        corrections[mapping.dataValue] = mapping.selectedMapping;
      }
    }
    for (const [dataValue, targetValue] of manualCorrections) {
      if (targetValue !== dataValue) {
        corrections[dataValue] = targetValue;
      }
    }
    return corrections;
  }

  async function handleFinalizeEnrichment(): Promise<void> {
    if (isJoinBlocked()) return;

    const enrichmentDataset = getEnrichmentDataset();
    const columns = resolveJoinColumns();
    const geoDataset = selectedDataset;
    if (!enrichmentDataset || !columns || !geoDataset || !view) return;
    if (view.joinedCount === 0) return;

    // A geographic enrichment file brings its attributes, not a second
    // geometry for the target dataset; a project table already joined to a
    // basemap brings its data, not the columns that join wrote.
    const sourceColumns = enrichmentDataset.columns
      .filter(
        (col) =>
          col.name !== columns.sourceColumn &&
          col.name !== '__id' &&
          col.name !== enrichmentDataset.geometry?.columnName &&
          !(
            enrichmentDataset.joinedBasemap &&
            JOINED_BASEMAP_COLUMNS.includes(col.name)
          )
      )
      .map((col) => col.name);
    if (sourceColumns.length === 0) return;

    isFinalizingJoin = true;
    const oldTableName = columns.targetTableName;
    const enrichedTableName = `${oldTableName}_enriched_${Date.now()}`;

    try {
      const sourceName = enrichmentDataset.name;
      const joinedColumns = await duckDBOrchestrator.createEnrichedTable({
        ...columns,
        sourceColumns,
        sourceLabel: sourceName.replace(/\.[^.]+$/u, ''),
        corrections: collectCorrections(),
        excludedValues: [...ignoredValues],
        enrichedTableName
      });

      datasetsStore.updateDataset(geoDataset.id, {
        tableName: enrichedTableName
      });
      const snapshot = await refreshDatasetMetadata(
        geoDataset.id,
        enrichedTableName,
        { force: true }
      );
      if (geoDataset.sourceFileId) {
        await persistEnrichedSourceFile({
          sourceFileId: geoDataset.sourceFileId,
          tableName: enrichedTableName,
          duckColumns: snapshot.duckColumns,
          geometry: geoDataset.geometry,
          joinedColumnOrigins: Object.fromEntries(
            joinedColumns.map(({ alias }) => [alias, sourceName])
          )
        });
      }

      try {
        await duckDBOrchestrator.updateDatasetTableName(
          geoDataset.sourceFileId || geoDataset.id,
          enrichedTableName
        );
      } catch (updateError) {
        logger.error(
          'Failed to update enriched dataset table name',
          LogCategory.DATA,
          updateError
        );
      }

      try {
        await Duck.dropTable(oldTableName);
      } catch (dropError) {
        logger.error(
          'Failed to drop previous enrichment table',
          LogCategory.DATA,
          dropError
        );
      }

      resetJoinState();
      onJoinFinalized();

      dataTabActions.setEnrichDataState({
        enrichmentDatasetId: undefined,
        enrichmentColumn: undefined,
        targetColumn: undefined,
        isEnrichmentActive: false
      });
    } catch (error) {
      logger.error('Failed to finalize enrichment', LogCategory.DATA, error);
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      isFinalizingJoin = false;
    }
  }

  function resetJoinState(): void {
    latestRun += 1;
    target = null;
    isComputingJoin = false;
    quality = null;
    targetOptions = [];
    fuzzyPassEstimate = null;
    fuzzyPassRunning = false;
    clearJoinedView();
    mappingOverrides.clear();
    manualCorrections.clear();
    ignoredValues.clear();
  }

  return {
    get view() {
      return view;
    },
    get isComputingJoin() {
      return isComputingJoin;
    },
    get isFinalizingJoin() {
      return isFinalizingJoin;
    },
    get targetOptions() {
      return targetOptions;
    },
    get fuzzyPassEstimate() {
      return fuzzyPassEstimate;
    },
    get fuzzyPassRunning() {
      return fuzzyPassRunning;
    },
    get joinedPage() {
      return joinedPage;
    },
    get joinedPageRows() {
      return joinedPageRows;
    },
    get joinedTargetValues() {
      return joinedTargetValues;
    },
    computeEnrichmentJoinStats,
    handleMappingChange,
    handleFinalizeEnrichment,
    handleManualCorrection,
    validateEntity,
    ignoreEntity,
    restoreEntity,
    runFullFuzzyPass,
    loadJoinedPage: (page: number) => void loadJoinedPage(page),
    requestJoinedEntities,
    resetJoinState
  };
}
