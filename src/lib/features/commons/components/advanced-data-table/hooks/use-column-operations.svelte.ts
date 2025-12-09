import { duckDBOrchestrator, RefineOperation } from '$lib/features/duckdb';
import { LogCategory, logger } from '../../../utils/logger';
import type { ColumnInfo } from '../types';

export interface UseColumnOperationsProps {
  tableName?: string | (() => string | undefined);
  columns: ColumnInfo[] | (() => ColumnInfo[]);
  onColumnsChange: () => Promise<void>;
  onColumnRefined?: () => Promise<void>;
  onRecordTransformation?: (summary: string) => void;
}

export interface UseColumnOperationsReturn {
  visibleColumns: ColumnInfo[];
  handleRefine: (
    columnName: string,
    operation: RefineOperation
  ) => Promise<void>;
}

function getValue<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop;
}

export function useColumnOperations(
  props: UseColumnOperationsProps
): UseColumnOperationsReturn {
  const visibleColumns = $derived.by(() => {
    return getValue(props.columns);
  });

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

  return {
    get visibleColumns() {
      return visibleColumns;
    },
    handleRefine
  };
}
