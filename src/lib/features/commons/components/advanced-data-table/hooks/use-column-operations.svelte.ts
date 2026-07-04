import * as m from '$lib/paraglide/messages';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { RefineOperation } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { showWarning } from '../../../utils/notification.utils.svelte';
import { LogCategory, logger } from '../../../utils/logger';
import type { ColumnInfo, ColumnType } from '../types';
import { resolveHookValue, type HookValue } from './table-hook.utils';

const DUCKDB_COLUMN_TYPE: Record<ColumnType, string> = {
  text: 'VARCHAR',
  number: 'DOUBLE',
  date: 'DATE',
  boolean: 'BOOLEAN'
};

export interface UseColumnOperationsProps {
  tableName?: HookValue<string | undefined>;
  datasetId?: HookValue<string | undefined>;
  columns: HookValue<ColumnInfo[]>;
  onColumnsChange: () => Promise<void>;
  onColumnRefined?: () => Promise<void>;
  onRecordTransformation?: (summary: string) => void;
  onColumnDeleted?: (columnName: string) => void;
  onColumnRenamed?: (oldName: string, newName: string) => void;
}

export interface UseColumnOperationsReturn {
  visibleColumns: ColumnInfo[];
  handleRefine: (
    columnName: string,
    operation: RefineOperation
  ) => Promise<void>;
  handleRename: (columnName: string) => void;
  handleChangeType: (columnName: string, newType: ColumnType) => Promise<void>;
  handleHide: (columnName: string) => void;
  handleDelete: (columnName: string) => Promise<void>;
  isColumnHidden: (columnName: string) => boolean;
  getAffectedVisualizations: (columnName: string) => VisualizationConfig[];
}

export function useColumnOperations(
  props: UseColumnOperationsProps
): UseColumnOperationsReturn {
  const visibleColumns = $derived.by(() => {
    const columns = resolveHookValue(props.columns);
    const datasetId = resolveHookValue(props.datasetId);

    if (!datasetId) return columns;

    const hiddenColumns = new Set(datasetsStore.getHiddenColumns(datasetId));
    return columns.filter((col) => !hiddenColumns.has(col.name));
  });

  function isColumnHidden(columnName: string): boolean {
    const datasetId = resolveHookValue(props.datasetId);
    if (!datasetId) return false;
    return datasetsStore.isColumnHidden(datasetId, columnName);
  }

  async function handleRefine(
    columnName: string,
    operation: RefineOperation
  ): Promise<void> {
    const tableName = resolveHookValue(props.tableName);

    if (!tableName) {
      return;
    }

    try {
      await duckDBOrchestrator.refineColumn(tableName, columnName, operation);

      if (props.onColumnRefined) {
        await props.onColumnRefined();
      } else {
        await props.onColumnsChange();
      }

      props.onRecordTransformation?.(
        m.history_column_refinement({ operation, columnName })
      );
    } catch (err) {
      logger.error('Error refining column', LogCategory.UI, err);
    }
  }

  function handleRename(columnName: string): void {
    props.onColumnRenamed?.(columnName, '');
  }

  async function handleChangeType(
    columnName: string,
    newType: ColumnType
  ): Promise<void> {
    const tableName = resolveHookValue(props.tableName);

    if (!tableName) {
      return;
    }

    const duckType = mapColumnTypeToDuckDB(newType);
    const { invalidatedCount } = await duckDBOrchestrator.changeColumnType(
      tableName,
      columnName,
      duckType
    );
    await props.onColumnsChange();
    props.onRecordTransformation?.(
      m.history_column_type_changed({ newType, columnName })
    );
    if (invalidatedCount > 0) {
      showWarning(
        m.warning_column_type_invalidated_title({ columnName }),
        m.warning_column_type_invalidated_subtitle({
          count: invalidatedCount,
          newType
        })
      );
    }
  }

  function handleHide(columnName: string): void {
    const datasetId = resolveHookValue(props.datasetId);

    if (!datasetId) {
      return;
    }

    datasetsStore.toggleColumnHidden(datasetId, columnName);
  }

  async function handleDelete(columnName: string): Promise<void> {
    const tableName = resolveHookValue(props.tableName);

    if (!tableName) {
      return;
    }

    try {
      await duckDBOrchestrator.dropColumn(tableName, columnName);
      await props.onColumnsChange();
      props.onColumnDeleted?.(columnName);
      props.onRecordTransformation?.(m.history_column_deleted({ columnName }));
    } catch (err) {
      logger.error('Error deleting column', LogCategory.UI, err);
    }
  }

  function getAffectedVisualizations(
    columnName: string
  ): VisualizationConfig[] {
    const datasetId = resolveHookValue(props.datasetId);
    if (!datasetId) {
      return [];
    }

    return visualizationStore.getVisualizationsUsingColumn(
      datasetId,
      columnName
    );
  }

  return {
    get visibleColumns() {
      return visibleColumns;
    },
    handleRefine,
    handleRename,
    handleChangeType,
    handleHide,
    handleDelete,
    isColumnHidden,
    getAffectedVisualizations
  };
}

function mapColumnTypeToDuckDB(type: ColumnType): string {
  return DUCKDB_COLUMN_TYPE[type] ?? DUCKDB_COLUMN_TYPE.text;
}
