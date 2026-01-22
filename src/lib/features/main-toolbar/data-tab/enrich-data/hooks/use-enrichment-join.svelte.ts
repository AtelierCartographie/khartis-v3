import { dataTabActions } from '$lib/features/commons/store/data-tab.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { ColumnType, type DatasetResult } from '$lib/features/data-pipeline';
import { Duck } from '$lib/features/duckdb';
import { SvelteMap } from 'svelte/reactivity';
import type { JoinStats } from '../../components';
import { computeDatasetJoinStats } from '../../services/join-stats.service';

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
  let joinMappings = $state(new SvelteMap<number, string>());

  const selectedDataset = $derived(datasetsStore.selectedDataset);

  function getGeoTableName(): string | null {
    if (!selectedDataset) return null;
    return (
      (selectedDataset as { duckdbTableName?: string; tableName?: string })
        .duckdbTableName ||
      (selectedDataset as { tableName?: string }).tableName ||
      selectedDataset.id
    );
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

      const stats = await computeDatasetJoinStats({
        sourceTableName: enrichmentDataset.tableName,
        sourceColumn: enrichCol.columnName,
        targetTableName: geoTableName,
        targetColumn: geoCol.columnName
      });

      const targetValues = (await Duck.query(
        `SELECT DISTINCT CAST("${geoCol.columnName}" AS VARCHAR) as val
         FROM "${geoTableName}"
         WHERE "${geoCol.columnName}" IS NOT NULL
         ORDER BY val`,
        { format: 'array' }
      )) as Array<{ val: string }>;

      const allTargetOptions = targetValues.map((v) => v.val).filter(Boolean);

      stats.entities = stats.entities.map((entity) => {
        if (entity.status === 'to_verify') {
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
        if (entity.status === 'to_verify') {
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
        .filter((e) => e.status === 'to_verify' && e.selectedMapping)
        .forEach((entity) => {
          corrections[entity.dataValue] = entity.selectedMapping!;
        });

      logger.info('Applying enrichment corrections', LogCategory.DATA, {
        corrections
      });

      const geoTableName = getGeoTableName();
      if (!geoTableName) return;

      for (const [oldValue, newValue] of Object.entries(corrections)) {
        await Duck.query(
          `UPDATE "${enrichmentDataset.tableName}" SET "${enrichCol.columnName}" = '${newValue.replace(/'/g, "''")}' WHERE "${enrichCol.columnName}" = '${oldValue.replace(/'/g, "''")}'`,
          { format: 'array' }
        );
      }

      const stats = await computeDatasetJoinStats({
        sourceTableName: enrichmentDataset.tableName,
        sourceColumn: enrichCol.columnName,
        targetTableName: geoTableName,
        targetColumn: geoCol.columnName
      });

      const targetValues = (await Duck.query(
        `SELECT DISTINCT CAST("${geoCol.columnName}" AS VARCHAR) as val
         FROM "${geoTableName}"
         WHERE "${geoCol.columnName}" IS NOT NULL
         ORDER BY val`,
        { format: 'array' }
      )) as Array<{ val: string }>;

      const allTargetOptions = targetValues.map((v) => v.val).filter(Boolean);

      stats.entities = stats.entities.map((entity) => {
        if (entity.status === 'to_verify') {
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
    if (!enrichmentDataset || !selectedDataset) return;

    const enrichCol = getEnrichDataFieldItems().find(
      (item) => item.id === getEnrichLinkedVariableId()
    );
    const geoCol = getGeoFileColumns().find(
      (item) => item.id === getGeoFileColumnId()
    );

    if (!enrichCol || !geoCol) return;

    isFinalizingJoin = true;

    try {
      const geoTableName = getGeoTableName();
      if (!geoTableName) return;

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
        enrichColumns: enrichmentColumns
      });

      const oldTableName = geoTableName;

      const enrichColsSelect = enrichmentColumns
        .map((col) => `e."${col}"`)
        .join(', ');

      const enrichedTableName = `${geoTableName}_enriched_${Date.now()}`;

      await Duck.query(
        `CREATE TABLE "${enrichedTableName}" AS
         SELECT g.*, ${enrichColsSelect}
         FROM "${geoTableName}" g
         LEFT JOIN "${enrichmentDataset.tableName}" e
         ON LOWER(CAST(g."${geoCol.columnName}" AS VARCHAR)) = LOWER(CAST(e."${enrichCol.columnName}" AS VARCHAR))`,
        { format: 'array' }
      );

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

      logger.success('Enrichment finalized', LogCategory.DATA, {
        newTable: enrichedTableName,
        addedColumns: enrichmentColumns
      });

      if (
        oldTableName !== enrichedTableName &&
        oldTableName.includes('_enriched_')
      ) {
        try {
          await Duck.query(`DROP TABLE IF EXISTS "${oldTableName}"`);
          logger.debug('Dropped old enriched table', LogCategory.DATA, {
            oldTableName
          });
        } catch (dropError) {
          logger.warn('Failed to drop old enriched table', LogCategory.DATA, {
            oldTableName,
            error: dropError
          });
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
