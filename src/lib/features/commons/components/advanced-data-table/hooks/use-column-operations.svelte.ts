import { SvelteSet } from 'svelte/reactivity';
import { duckDBOrchestrator, RefineOperation } from '$lib/features/duckdb';
import { logger, LogCategory } from '../../../utils/logger';
import type { ColumnInfo } from '../types';

export interface UseColumnOperationsProps {
  tableName?: string | (() => string | undefined);
  columns: ColumnInfo[] | (() => ColumnInfo[]);
  onColumnsChange: () => Promise<void>;
  onSortColumnRenamed?: (oldName: string, newName: string) => void;
  onSortColumnDeleted?: (columnName: string) => void;
  onRecordTransformation?: (summary: string) => void;
}

export interface UseColumnOperationsReturn {
  hiddenColumns: Set<string>;
  renameModalOpen: boolean;
  columnToRename: string | null;
  visibleColumns: ColumnInfo[];
  setRenameModalOpen: (open: boolean) => void;
  setColumnToRename: (columnName: string | null) => void;
  renameColumn: (oldName: string, newName: string) => Promise<void>;
  dropColumn: (columnName: string) => Promise<void>;
  toggleColumnVisibility: (columnName: string) => void;
  openRenameModal: (columnName: string) => void;
  handleRename: (newName: string) => Promise<void>;
  handleRefine: (columnName: string, operation: RefineOperation) => Promise<void>;
  changeColumnType: (columnName: string, duckType: string) => Promise<void>;
}

function getValue<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop;
}

export function useColumnOperations(
  props: UseColumnOperationsProps
): UseColumnOperationsReturn {
  let hiddenColumns = new SvelteSet<string>();
  let renameModalOpen = $state<boolean>(false);
  let columnToRename = $state<string | null>(null);

  const visibleColumns = $derived.by(() => {
    const columns = getValue(props.columns);
    const hidden = Array.from(hiddenColumns);
    return columns.filter((col) => !hidden.includes(col.name));
  });

  function setRenameModalOpen(open: boolean): void {
    renameModalOpen = open;
  }

  function setColumnToRename(columnName: string | null): void {
    columnToRename = columnName;
  }

  async function renameColumn(oldName: string, newName: string): Promise<void> {
    const tableName = getValue(props.tableName);

    if (!tableName) {
      return;
    }

    try {
      await duckDBOrchestrator.renameColumn(tableName, oldName, newName);
      props.onSortColumnRenamed?.(oldName, newName);

      if (hiddenColumns.has(oldName)) {
        hiddenColumns.delete(oldName);
        hiddenColumns.add(newName);
        hiddenColumns = new SvelteSet(hiddenColumns);
      }

      await props.onColumnsChange();
      props.onRecordTransformation?.(`Renommage de ${oldName} en ${newName}`);
    } catch (err) {
      logger.error('Error renaming column', LogCategory.UI, err);
    }
  }

  async function dropColumn(columnName: string): Promise<void> {
    const tableName = getValue(props.tableName);

    if (!tableName) {
      return;
    }

    try {
      await duckDBOrchestrator.dropColumn(tableName, columnName);
      props.onSortColumnDeleted?.(columnName);

      if (hiddenColumns.has(columnName)) {
        hiddenColumns.delete(columnName);
        hiddenColumns = new SvelteSet(hiddenColumns);
      }

      await props.onColumnsChange();
      props.onRecordTransformation?.(`Suppression de la colonne ${columnName}`);
    } catch (err) {
      logger.error('Error dropping column', LogCategory.UI, err);
    }
  }

  function toggleColumnVisibility(columnName: string): void {
    if (hiddenColumns.has(columnName)) {
      hiddenColumns.delete(columnName);
    } else {
      hiddenColumns.add(columnName);
    }
    hiddenColumns = new SvelteSet(hiddenColumns);
  }

  function openRenameModal(columnName: string): void {
    columnToRename = columnName;
    renameModalOpen = true;
  }

  async function handleRename(newName: string): Promise<void> {
    if (!columnToRename) return;

    const oldName = columnToRename;
    await renameColumn(oldName, newName);
    renameModalOpen = false;
    columnToRename = null;
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
      await props.onColumnsChange();
      props.onRecordTransformation?.(`Affinage (${operation}) sur ${columnName}`);
    } catch (err) {
      logger.error('Error refining column', LogCategory.UI, err);
    }
  }

  async function changeColumnType(
    columnName: string,
    duckType: string
  ): Promise<void> {
    const tableName = getValue(props.tableName);

    if (!tableName) {
      return;
    }

    try {
      await duckDBOrchestrator.changeColumnType(tableName, columnName, duckType);
      await props.onColumnsChange();
      props.onRecordTransformation?.(`Type de ${columnName} converti en ${duckType}`);
    } catch (err) {
      logger.error('Error changing column type', LogCategory.UI, err);
    }
  }

  return {
    get hiddenColumns() {
      return hiddenColumns;
    },
    get renameModalOpen() {
      return renameModalOpen;
    },
    get columnToRename() {
      return columnToRename;
    },
    get visibleColumns() {
      return visibleColumns;
    },
    setRenameModalOpen,
    setColumnToRename,
    renameColumn,
    dropColumn,
    toggleColumnVisibility,
    openRenameModal,
    handleRename,
    handleRefine,
    changeColumnType
  };
}
