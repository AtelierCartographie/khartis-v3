import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { JoinStats } from '../components/index';
import { refreshDatasetMetadata } from '../services/dataset-metadata.service';
import { computeDatasetJoinStats } from '../services/join-stats.service';
import { persistTabularSourceSnapshot } from '../services/tabular-source-snapshot.service';
import { canFinalizeJoin } from '../utils/join-validation.utils';
import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import { dataTabActions } from '$lib/features/commons/stores/data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { showError } from '$lib/features/commons/utils/notification.utils.svelte';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';

export interface UseEnrichmentJoinProps {
  getEnrichmentDataset: () => DatasetResult | null;
  getEnrichLinkedVariableId: () => number | undefined;
  getGeoFileColumnId: () => number | undefined;
  getEnrichDataFieldItems: () => Array<{ id: number; columnName: string }>;
  getGeoFileColumns: () => Array<{ id: number; columnName: string }>;
  isJoinBlocked?: () => boolean;
  onJoinFinalized: () => void;
}

export interface UseEnrichmentJoinReturn {
  readonly joinStats: JoinStats | null;
  readonly isComputingJoin: boolean;
  readonly isFinalizingJoin: boolean;
  readonly targetOptions: string[];
  readonly joinMappings: SvelteMap<number, string>;
  computeEnrichmentJoinStats: () => Promise<void>;
  handleMappingChange: (index: number, value: string) => void;
  handleFinalizeEnrichment: () => Promise<void>;
  handleManualCorrection: (dataValue: string, targetValue: string) => void;
  validateEntity: (dataValue: string, targetValue: string) => void;
  ignoreEntity: (dataValue: string) => void;
  restoreEntity: (dataValue: string) => void;
  resetJoinState: () => void;
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

  let joinStats = $state<JoinStats | null>(null);
  let isComputingJoin = $state(false);
  let isFinalizingJoin = $state(false);
  let targetOptions = $state<string[]>([]);
  let joinMappings = new SvelteMap<number, string>();
  let ignoredDataValues = $state(new Set<string>());
  let manualCorrections = new SvelteMap<string, string>();

  function applyIgnoredEntities(stats: JoinStats): JoinStats {
    if (ignoredDataValues.size === 0) {
      return { ...stats, ignoredCount: 0 };
    }
    let unrecognizedDelta = 0;
    let toVerifyDelta = 0;
    const updatedEntities = stats.entities.map((entity) => {
      if (!ignoredDataValues.has(entity.dataValue)) return entity;
      if (entity.status === JoinStatus.UNRECOGNIZED) unrecognizedDelta++;
      if (entity.status === JoinStatus.TO_VERIFY) toVerifyDelta++;
      return { ...entity, status: JoinStatus.IGNORED };
    });
    return {
      ...stats,
      entities: updatedEntities,
      unrecognizedCount: Math.max(
        0,
        stats.unrecognizedCount - unrecognizedDelta
      ),
      toVerifyCount: Math.max(0, stats.toVerifyCount - toVerifyDelta),
      ignoredCount: ignoredDataValues.size
    };
  }

  function collectEffectiveCorrections(): Record<string, string> {
    const corrections: Record<string, string> = {};

    if (joinStats) {
      for (const entity of joinStats.entities) {
        if (
          entity.status === JoinStatus.TO_VERIFY &&
          entity.selectedMapping &&
          entity.selectedMapping !== entity.dataValue
        ) {
          corrections[entity.dataValue] = entity.selectedMapping;
        }
      }
    }

    for (const [dataValue, targetValue] of manualCorrections.entries()) {
      if (targetValue && targetValue !== dataValue) {
        corrections[dataValue] = targetValue;
      }
    }

    return corrections;
  }

  function resolveCorrectedJoinExpression(columnExpression: string): string {
    const corrections = collectEffectiveCorrections();
    const entries = Object.entries(corrections);
    if (entries.length === 0) return columnExpression;

    const cases = entries
      .map(
        ([original, corrected]) =>
          `WHEN ${columnExpression} = '${escapeSqlString(original)}' THEN '${escapeSqlString(corrected)}'`
      )
      .join('\n               ');

    return `CASE
               ${cases}
               ELSE ${columnExpression}
             END`;
  }

  function buildIgnoredWhereClause(columnExpression: string): string {
    if (ignoredDataValues.size === 0) return '';
    const ignoredValues = [...ignoredDataValues]
      .map((value) => `'${escapeSqlString(value)}'`)
      .join(', ');
    return `WHERE ${columnExpression} NOT IN (${ignoredValues})`;
  }

  const selectedDataset = $derived(datasetsStore.selectedDataset);

  function getGeoTableName(): string | null {
    if (!selectedDataset) return null;
    return selectedDataset.tableName || null;
  }

  async function computeEnrichmentJoinStats(): Promise<void> {
    if (isJoinBlocked()) {
      joinStats = null;
      targetOptions = [];
      return;
    }

    const enrichmentDataset = getEnrichmentDataset();
    if (!enrichmentDataset || !selectedDataset) return;

    const enrichCol = getEnrichDataFieldItems().find(
      (item) => item.id === getEnrichLinkedVariableId()
    );
    const geoCol = getGeoFileColumns().find(
      (item) => item.id === getGeoFileColumnId()
    );

    if (!enrichCol || !geoCol) {
      joinStats = null;
      targetOptions = [];
      return;
    }

    isComputingJoin = true;

    try {
      const geoTableName = getGeoTableName();
      if (!geoTableName) return;
      const escapedGeoTableName = escapeIdentifier(geoTableName);
      const escapedGeoColumn = escapeIdentifier(geoCol.columnName);

      const stats = await computeDatasetJoinStats({
        sourceTableName: enrichmentDataset.tableName,
        sourceColumn: enrichCol.columnName,
        targetTableName: geoTableName,
        targetColumn: geoCol.columnName
      });

      const targetValues = (await Duck.query(
        `SELECT DISTINCT CAST("${escapedGeoColumn}" AS VARCHAR) as val
         FROM "${escapedGeoTableName}"
         WHERE "${escapedGeoColumn}" IS NOT NULL
         ORDER BY val`,
        { format: 'array' }
      )) as Array<{ val: string }>;

      const allTargetOptions = targetValues.map((v) => v.val).filter(Boolean);
      targetOptions = allTargetOptions;

      stats.entities = stats.entities.map((entity) => {
        if (entity.status === JoinStatus.TO_VERIFY) {
          return {
            ...entity,
            basemapOptions: entity.matches?.length
              ? entity.matches
              : allTargetOptions.slice(0, 20),
            selectedMapping: entity.matches?.[0] || undefined
          };
        }
        return entity;
      });

      joinStats = applyIgnoredEntities(stats);
    } catch (error) {
      logger.error(
        'Failed to compute enrichment join stats',
        LogCategory.DATA,
        error
      );
      joinStats = null;
      targetOptions = [];
      showError(m.join_error_title(), m.join_error_message());
    } finally {
      isComputingJoin = false;
    }
  }

  function ignoreEntity(dataValue: string): void {
    if (!dataValue || ignoredDataValues.has(dataValue)) return;
    ignoredDataValues = new Set([...ignoredDataValues, dataValue]);
    manualCorrections.delete(dataValue);
    if (joinStats) {
      joinStats = applyIgnoredEntities({
        ...joinStats,
        entities: joinStats.entities.map((entity) =>
          entity.status === JoinStatus.IGNORED && entity.dataValue !== dataValue
            ? entity
            : entity.dataValue === dataValue
              ? entity
              : entity
        ),
        unrecognizedCount: joinStats.unrecognizedCount,
        toVerifyCount: joinStats.toVerifyCount,
        ignoredCount: 0
      });
    }
  }

  function restoreEntity(dataValue: string): void {
    if (!ignoredDataValues.has(dataValue)) return;
    const next = new Set(ignoredDataValues);
    next.delete(dataValue);
    ignoredDataValues = next;
    if (joinStats) {
      const restoredEntities = joinStats.entities.map((entity) =>
        entity.dataValue === dataValue
          ? { ...entity, status: JoinStatus.UNRECOGNIZED }
          : entity
      );
      joinStats = applyIgnoredEntities({
        ...joinStats,
        entities: restoredEntities,
        unrecognizedCount: joinStats.unrecognizedCount + 1,
        ignoredCount: 0
      });
    }
  }

  function handleMappingChange(index: number, value: string): void {
    joinMappings.set(index, value);

    if (joinStats) {
      let toVerifyIndex = 0;
      const updatedEntities = joinStats.entities.map((entity) => {
        if (entity.status === JoinStatus.TO_VERIFY) {
          if (toVerifyIndex === index) {
            toVerifyIndex++;
            return { ...entity, selectedMapping: value };
          }
          toVerifyIndex++;
        }
        return entity;
      });

      joinStats = {
        ...joinStats,
        entities: updatedEntities
      };
    }
  }

  function handleManualCorrection(
    dataValue: string,
    targetValue: string
  ): void {
    if (!dataValue || !targetValue) return;
    manualCorrections.set(dataValue, targetValue);

    if (!joinStats) return;

    const updatedEntities = joinStats.entities.map((entity) =>
      entity.dataValue === dataValue
        ? {
            ...entity,
            status: JoinStatus.JOINED,
            geoValue: targetValue,
            basemapValue: targetValue,
            selectedMapping: targetValue
          }
        : entity
    );

    joinStats = applyIgnoredEntities({
      ...joinStats,
      entities: updatedEntities,
      joinedCount: updatedEntities.filter(
        (entity) => entity.status === JoinStatus.JOINED
      ).length,
      toVerifyCount: updatedEntities.filter(
        (entity) => entity.status === JoinStatus.TO_VERIFY
      ).length,
      unrecognizedCount: updatedEntities.filter(
        (entity) => entity.status === JoinStatus.UNRECOGNIZED
      ).length
    });
  }

  function validateEntity(dataValue: string, targetValue: string): void {
    handleManualCorrection(dataValue, targetValue);
  }

  async function handleFinalizeEnrichment(): Promise<void> {
    if (isJoinBlocked()) {
      return;
    }

    const enrichmentDataset = getEnrichmentDataset();
    if (!enrichmentDataset || !selectedDataset || !joinStats) return;

    const enrichCol = getEnrichDataFieldItems().find(
      (item) => item.id === getEnrichLinkedVariableId()
    );
    const geoCol = getGeoFileColumns().find(
      (item) => item.id === getGeoFileColumnId()
    );

    if (!enrichCol || !geoCol) return;

    if (!canFinalizeJoin(joinStats)) {
      return;
    }

    const geoTableName = getGeoTableName();
    if (!geoTableName) return;

    isFinalizingJoin = true;

    try {
      const enrichmentColumns = enrichmentDataset.columns
        .filter(
          (col) => col.name !== enrichCol.columnName && col.name !== '__id'
        )
        .map((col) => col.name);

      if (enrichmentColumns.length === 0) {
        isFinalizingJoin = false;
        return;
      }

      const oldTableName = geoTableName;
      const escapedGeoTableName = escapeIdentifier(geoTableName);
      const escapedEnrichmentTableName = escapeIdentifier(
        enrichmentDataset.tableName
      );
      const escapedGeoColumn = escapeIdentifier(geoCol.columnName);
      const escapedEnrichmentColumn = escapeIdentifier(enrichCol.columnName);

      const enrichColsSelect = enrichmentColumns
        .map((col) => `e."${escapeIdentifier(col)}"`)
        .join(', ');
      const enrichColsDedupSelect = enrichmentColumns
        .map(
          (col) =>
            `any_value(source."${escapeIdentifier(col)}") AS "${escapeIdentifier(col)}"`
        )
        .join(',\n            ');
      const enrichmentJoinValueExpression = `CAST(e."${escapedEnrichmentColumn}" AS VARCHAR)`;
      const correctedJoinValueExpression = resolveCorrectedJoinExpression(
        enrichmentJoinValueExpression
      );
      const ignoredWhereClause = buildIgnoredWhereClause(
        enrichmentJoinValueExpression
      );

      const enrichedTableName = `${geoTableName}_enriched_${Date.now()}`;
      const escapedEnrichedTableName = escapeIdentifier(enrichedTableName);

      await Duck.query(
        `CREATE TABLE "${escapedEnrichedTableName}" AS
         WITH enrichment_source AS (
           SELECT
             ${correctedJoinValueExpression} AS __khartis_join_value,
             ${enrichmentColumns
               .map(
                 (col) =>
                   `e."${escapeIdentifier(col)}" AS "${escapeIdentifier(col)}"`
               )
               .join(',\n             ')}
           FROM "${escapedEnrichmentTableName}" e
           ${ignoredWhereClause}
         ),
         enrichment_unique AS (
           SELECT
             normalize_text_join(__khartis_join_value) AS join_key,
             ${enrichColsDedupSelect}
           FROM enrichment_source source
           GROUP BY 1
         )
         SELECT g.*, ${enrichColsSelect}
         FROM "${escapedGeoTableName}" g
         LEFT JOIN enrichment_unique e
         ON normalize_text_join(CAST(g."${escapedGeoColumn}" AS VARCHAR)) = e.join_key`,
        { format: 'array' }
      );

      datasetsStore.updateDataset(selectedDataset.id, {
        tableName: enrichedTableName
      });
      const snapshot = await refreshDatasetMetadata(
        selectedDataset.id,
        enrichedTableName,
        { force: true }
      );
      if (selectedDataset.sourceFileId) {
        await persistTabularSourceSnapshot({
          sourceFileId: selectedDataset.sourceFileId,
          tableName: enrichedTableName,
          duckColumns: snapshot.duckColumns,
          geometryColumnName: selectedDataset.geometry?.columnName
        });
      }

      try {
        await duckDBOrchestrator.updateDatasetTableName(
          selectedDataset.sourceFileId || selectedDataset.id,
          enrichedTableName
        );
      } catch (updateError) {
        logger.error(
          'Failed to update enriched dataset table name',
          LogCategory.DATA,
          updateError
        );
      }

      if (oldTableName !== enrichedTableName) {
        try {
          await Duck.dropTable(oldTableName);
        } catch (dropError) {
          logger.error(
            'Failed to drop previous enrichment table',
            LogCategory.DATA,
            dropError
          );
        }
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
    joinStats = null;
    targetOptions = [];
    joinMappings = new SvelteMap<number, string>();
    ignoredDataValues = new Set();
    manualCorrections = new SvelteMap<string, string>();
  }

  return {
    get joinStats() {
      return joinStats;
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
    get joinMappings() {
      return joinMappings;
    },
    computeEnrichmentJoinStats,
    handleMappingChange,
    handleFinalizeEnrichment,
    handleManualCorrection,
    validateEntity,
    ignoreEntity,
    restoreEntity,
    resetJoinState
  };
}
