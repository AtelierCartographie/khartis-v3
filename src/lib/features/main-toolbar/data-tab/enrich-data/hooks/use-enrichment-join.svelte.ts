import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { ColumnType, type DatasetResult } from '$lib/features/data-pipeline';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { JoinStats } from '../../components';
import { computeDatasetJoinStats } from '../../services/join-stats.service';
import { canFinalizeJoin } from '../../services/join-validation';

export interface UseEnrichmentJoinProps {
  getEnrichmentDataset: () => DatasetResult | null;
  getEnrichLinkedVariableId: () => number | undefined;
  getGeoFileColumnId: () => number | undefined;
  getEnrichDataFieldItems: () => Array<{ id: number; columnName: string }>;
  getGeoFileColumns: () => Array<{ id: number; columnName: string }>;
  onJoinFinalized: () => void;
}

export interface UseEnrichmentJoinReturn {
  readonly joinStats: JoinStats | null;
  readonly isComputingJoin: boolean;
  readonly isFinalizingJoin: boolean;
  readonly joinMappings: SvelteMap<number, string>;
  computeEnrichmentJoinStats: () => Promise<void>;
  handleMappingChange: (index: number, value: string) => void;
  handleApplyCorrections: () => Promise<void>;
  handleFinalizeEnrichment: () => Promise<void>;
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
    onJoinFinalized
  } = props;

  let joinStats = $state<JoinStats | null>(null);
  let isComputingJoin = $state(false);
  let isFinalizingJoin = $state(false);
  let joinMappings = new SvelteMap<number, string>();

  const selectedDataset = $derived(datasetsStore.selectedDataset);

  function getGeoTableName(): string | null {
    if (!selectedDataset) return null;
    return selectedDataset.tableName || null;
  }

  async function computeEnrichmentJoinStats(): Promise<void> {
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

      joinStats = stats;
    } catch (error) {
      logger.error(
        'Failed to compute enrichment join stats',
        LogCategory.DATA,
        error
      );
      joinStats = null;
    } finally {
      isComputingJoin = false;
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

  async function handleApplyCorrections(): Promise<void> {
    const enrichmentDataset = getEnrichmentDataset();
    if (!enrichmentDataset || !selectedDataset || !joinStats) return;

    const enrichCol = getEnrichDataFieldItems().find(
      (item) => item.id === getEnrichLinkedVariableId()
    );
    const geoCol = getGeoFileColumns().find(
      (item) => item.id === getGeoFileColumnId()
    );

    if (!enrichCol || !geoCol) return;

    try {
      const corrections: Record<string, string> = {};
      joinStats.entities
        .filter((e) => e.status === JoinStatus.TO_VERIFY && e.selectedMapping)
        .forEach((entity) => {
          corrections[entity.dataValue] = entity.selectedMapping!;
        });

      logger.info('Applying enrichment corrections', LogCategory.DATA, {
        count: Object.keys(corrections).length
      });

      const geoTableName = getGeoTableName();
      if (!geoTableName) return;
      const escapedEnrichmentTableName = escapeIdentifier(
        enrichmentDataset.tableName
      );
      const escapedEnrichmentColumn = escapeIdentifier(enrichCol.columnName);
      const escapedGeoTableName = escapeIdentifier(geoTableName);
      const escapedGeoColumn = escapeIdentifier(geoCol.columnName);

      const correctionEntries = Object.entries(corrections);
      if (correctionEntries.length > 0) {
        const valueRows = correctionEntries
          .map(
            ([original, corrected]) =>
              `('${escapeSqlString(original)}', '${escapeSqlString(corrected)}')`
          )
          .join(', ');

        const tempTable = `enrich_corrections_${Date.now()}`;
        await Duck.query(
          `CREATE TEMP TABLE "${tempTable}" (original VARCHAR, corrected VARCHAR)`
        );
        await Duck.query(`INSERT INTO "${tempTable}" VALUES ${valueRows}`);
        await Duck.query(
          `UPDATE "${escapedEnrichmentTableName}"
           SET "${escapedEnrichmentColumn}" = c.corrected
           FROM "${tempTable}" c
           WHERE "${escapedEnrichmentColumn}" = c.original`,
          { format: 'array' }
        );
        await Duck.query(`DROP TABLE "${tempTable}"`);
      }

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

      joinStats = stats;
      joinMappings = new SvelteMap<number, string>();

      logger.success('Corrections applied', LogCategory.DATA);

      if (
        joinStats.toVerifyCount === 0 &&
        joinStats.duplicateCount === 0 &&
        joinStats.unrecognizedCount === 0 &&
        joinStats.joinedCount > 0
      ) {
        await handleFinalizeEnrichment();
      }
    } catch (error) {
      logger.error('Failed to apply corrections', LogCategory.DATA, error);
    }
  }

  async function handleFinalizeEnrichment(): Promise<void> {
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
      logger.warn(
        'Cannot finalize enrichment join with unresolved entities',
        LogCategory.DATA,
        {
          toVerify: joinStats.toVerifyCount,
          duplicates: joinStats.duplicateCount,
          joinedCount: joinStats.joinedCount
        }
      );
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
        logger.warn('No columns to enrich with', LogCategory.DATA);
        isFinalizingJoin = false;
        return;
      }

      logger.info('Finalizing enrichment join', LogCategory.DATA, {
        geoTable: geoTableName,
        enrichTable: enrichmentDataset.tableName,
        enrichColumnsCount: enrichmentColumns.length
      });

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
            `any_value(e."${escapeIdentifier(col)}") AS "${escapeIdentifier(col)}"`
        )
        .join(',\n            ');

      const enrichedTableName = `${geoTableName}_enriched_${Date.now()}`;
      const escapedEnrichedTableName = escapeIdentifier(enrichedTableName);

      if (joinStats.duplicateCount > 0) {
        logger.warn(
          'Finalizing enrichment with duplicate source keys, keeping one value per normalized key',
          LogCategory.DATA,
          {
            duplicateCount: joinStats.duplicateCount,
            enrichColumn: enrichCol.columnName
          }
        );
      }

      await Duck.query(
        `CREATE TABLE "${escapedEnrichedTableName}" AS
         WITH enrichment_unique AS (
           SELECT
             normalize_text_join(CAST(e."${escapedEnrichmentColumn}" AS VARCHAR)) AS join_key,
             ${enrichColsDedupSelect}
           FROM "${escapedEnrichmentTableName}" e
           GROUP BY 1
         )
         SELECT g.*, ${enrichColsSelect}
         FROM "${escapedGeoTableName}" g
         LEFT JOIN enrichment_unique e
         ON normalize_text_join(CAST(g."${escapedGeoColumn}" AS VARCHAR)) = e.join_key`,
        { format: 'array' }
      );

      const rowCountResult = (await Duck.query(
        `SELECT COUNT(*) as count FROM "${escapedEnrichedTableName}"`,
        { format: 'array' }
      )) as Array<{ count: number }>;
      const newRowCount = Number(rowCountResult?.[0]?.count ?? 0);

      const newColumns = await Duck.analyse(enrichedTableName);

      const toColumnType = (type: string): ColumnType => {
        if (type === 'numeric' || type === 'number') return ColumnType.NUMBER;
        if (type === 'date') return ColumnType.DATE;
        if (type === 'boolean') return ColumnType.BOOLEAN;
        if (type === 'geometry') return ColumnType.GEOMETRY;
        return ColumnType.TEXT;
      };

      datasetsStore.updateDataset(selectedDataset.id, {
        tableName: enrichedTableName,
        columns: newColumns.map((col) => ({
          name: col.name,
          type: toColumnType(col.type_simple || 'text'),
          values: [],
          stats: {
            name: col.name,
            type: toColumnType(col.type_simple || 'text'),
            count: col.count ?? 0,
            nulls: col.nulls ?? 0,
            uniques: col.uniques ?? 0,
            min: col.min,
            max: col.max,
            mean: typeof col.mean === 'number' ? col.mean : undefined,
            median: typeof col.median === 'number' ? col.median : undefined,
            stdDev: typeof col.stddev === 'number' ? col.stddev : undefined
          }
        }))
      });
      datasetsStore.updateDatasetRowCount(selectedDataset.id, newRowCount);

      // Update the existing orchestrator dataset entry with the new enriched table name
      // (avoids creating a duplicate entry with the same sourceFileId)
      try {
        await duckDBOrchestrator.updateDatasetTableName(
          selectedDataset.sourceFileId || selectedDataset.id,
          enrichedTableName
        );
      } catch (updateError) {
        logger.warn(
          'Failed to update enriched table in orchestrator',
          LogCategory.DATA,
          { enrichedTableName, error: updateError }
        );
      }

      logger.success('Enrichment finalized', LogCategory.DATA, {
        newTable: enrichedTableName,
        addedColumns: enrichmentColumns
      });

      // Drop the old table to free memory (both first-time and subsequent enrichments)
      if (oldTableName !== enrichedTableName) {
        try {
          await Duck.query(
            `DROP TABLE IF EXISTS "${escapeIdentifier(oldTableName)}"`
          );
          logger.debug('Dropped old table after enrichment', LogCategory.DATA, {
            oldTableName
          });
        } catch (dropError) {
          logger.warn(
            'Failed to drop old table after enrichment',
            LogCategory.DATA,
            {
              oldTableName,
              error: dropError
            }
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
    } finally {
      isFinalizingJoin = false;
    }
  }

  function resetJoinState(): void {
    joinStats = null;
    joinMappings = new SvelteMap<number, string>();
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
    get joinMappings() {
      return joinMappings;
    },
    computeEnrichmentJoinStats,
    handleMappingChange,
    handleApplyCorrections,
    handleFinalizeEnrichment,
    resetJoinState
  };
}
