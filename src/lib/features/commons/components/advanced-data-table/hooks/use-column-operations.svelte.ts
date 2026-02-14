import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { duckDBOrchestrator, RefineOperation } from '$lib/features/duckdb';
import { LogCategory, logger } from '../../../utils/logger';
import type { ColumnInfo, ColumnType } from '../types';

export interface UseColumnOperationsProps {
  tableName?: string | (() => string | undefined);
  datasetId?: string | (() => string | undefined);
  columns: ColumnInfo[] | (() => ColumnInfo[]);
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

function getValue<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop;
}

export function useColumnOperations(
  props: UseColumnOperationsProps
): UseColumnOperationsReturn {
  const visibleColumns = $derived.by(() => {
    const columns = getValue(props.columns);
    const datasetId = getValue(props.datasetId);

    if (!datasetId) return columns;

    return columns.filter(
      (col) => !datasetsStore.isColumnHidden(datasetId, col.name)
    );
  });

  function isColumnHidden(columnName: string): boolean {
    const datasetId = getValue(props.datasetId);
    if (!datasetId) return false;
    return datasetsStore.isColumnHidden(datasetId, columnName);
  }

  async function handleRefine(
    columnName: string,
    operation: RefineOperation
  ): Promise<void> {
    const tableName = getValue(props.tableName);

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
        `Affinage (${operation}) sur ${columnName}`
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
    const tableName = getValue(props.tableName);

    if (!tableName) {
      return;
    }

    const duckType = mapColumnTypeToDuckDB(newType);
    await duckDBOrchestrator.changeColumnType(tableName, columnName, duckType);
    await props.onColumnsChange();
    props.onRecordTransformation?.(
      `Type changé (${newType}) sur ${columnName}`
    );
  }

  function handleHide(columnName: string): void {
    const datasetId = getValue(props.datasetId);

    if (!datasetId) {
      return;
    }

    datasetsStore.toggleColumnHidden(datasetId, columnName);
    logger.debug('Column visibility toggled', LogCategory.UI, {
      datasetId,
      columnName
    });
  }

  async function handleDelete(columnName: string): Promise<void> {
    const tableName = getValue(props.tableName);

    if (!tableName) {
      return;
    }

    try {
      await duckDBOrchestrator.dropColumn(tableName, columnName);
      await props.onColumnsChange();
      props.onColumnDeleted?.(columnName);
      props.onRecordTransformation?.(`Colonne supprimée: ${columnName}`);
    } catch (err) {
      logger.error('Error deleting column', LogCategory.UI, err);
    }
  }

  function getAffectedVisualizations(
    columnName: string
  ): VisualizationConfig[] {
    return visualizationStore.getVisualizationsUsingColumn(columnName);
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
  switch (type) {
    case 'text':
      return 'VARCHAR';
    case 'number':
      return 'DOUBLE';
    case 'date':
      return 'DATE';
    case 'boolean':
      return 'BOOLEAN';
    default:
      return 'VARCHAR';
  }
}
