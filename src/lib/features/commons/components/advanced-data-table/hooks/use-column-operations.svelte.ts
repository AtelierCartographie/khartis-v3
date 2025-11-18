/**
 * Hook pour la gestion des opérations sur les colonnes
 * Gère le renommage, la suppression, le masquage et le raffinement des colonnes
 */

import { SvelteSet } from 'svelte/reactivity';
import { duckDBOrchestrator, RefineOperation } from '$lib/features/duckdb';
import { logger, LogCategory } from '../../../utils/logger';
import type { ColumnInfo } from '../types';

export interface UseColumnOperationsProps {
  /** Nom de la table DuckDB */
  tableName?: string | (() => string | undefined);

  /** Liste des colonnes */
  columns: ColumnInfo[] | (() => ColumnInfo[]);

  /**
   * Callback appelé après modification des colonnes
   * Permet de recharger les données
   */
  onColumnsChange: () => Promise<void>;

  /**
   * Callback pour mettre à jour le tri si la colonne renommée est triée
   */
  onSortColumnRenamed?: (oldName: string, newName: string) => void;

  /**
   * Callback pour réinitialiser le tri si la colonne supprimée est triée
   */
  onSortColumnDeleted?: (columnName: string) => void;
}

export interface UseColumnOperationsReturn {
  /** Colonnes masquées */
  hiddenColumns: Set<string>;

  /** État du modal de renommage */
  renameModalOpen: boolean;

  /** Colonne en cours de renommage */
  columnToRename: string | null;

  /** Colonnes visibles (dérivé) */
  visibleColumns: ColumnInfo[];

  /**
   * Définit l'état du modal de renommage
   */
  setRenameModalOpen: (open: boolean) => void;

  /**
   * Définit la colonne à renommer
   */
  setColumnToRename: (columnName: string | null) => void;

  /**
   * Renomme une colonne
   * @param oldName Nom actuel de la colonne
   * @param newName Nouveau nom de la colonne
   */
  renameColumn: (oldName: string, newName: string) => Promise<void>;

  /**
   * Supprime une colonne
   * @param columnName Nom de la colonne à supprimer
   */
  dropColumn: (columnName: string) => Promise<void>;

  /**
   * Masque/Affiche une colonne (toggle)
   * @param columnName Nom de la colonne
   */
  toggleColumnVisibility: (columnName: string) => void;

  /**
   * Ouvre le modal de renommage pour une colonne
   * @param columnName Nom de la colonne à renommer
   */
  openRenameModal: (columnName: string) => void;

  /**
   * Gestionnaire de renommage via le modal
   * @param newName Nouveau nom de la colonne
   */
  handleRename: (newName: string) => Promise<void>;

  /**
   * Applique une opération de raffinement sur une colonne
   * @param columnName Nom de la colonne
   * @param operation Opération à appliquer
   */
  handleRefine: (
    columnName: string,
    operation: RefineOperation
  ) => Promise<void>;
}

/**
 * Obtient la valeur d'une prop (fonction ou valeur directe)
 */
function getValue<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop;
}

/**
 * Hook de gestion des opérations sur les colonnes
 *
 * @example
 * ```typescript
 * const columnOps = useColumnOperations({
 *   tableName: 'my_table',
 *   columns: () => tableData.columns,
 *   onColumnsChange: async () => {
 *     await tableData.loadColumnsInfo();
 *     await virtualScroll.initializeRows(0);
 *   },
 *   onSortColumnRenamed: (oldName, newName) => {
 *     if (sort.sortColumn === oldName) {
 *       sort.sortColumn = newName;
 *     }
 *   }
 * });
 * ```
 */
export function useColumnOperations(
  props: UseColumnOperationsProps
): UseColumnOperationsReturn {
  let hiddenColumns = new SvelteSet<string>();
  let renameModalOpen = $state<boolean>(false);
  let columnToRename = $state<string | null>(null);

  /**
   * Colonnes visibles (filtre les colonnes masquées)
   */
  const visibleColumns = $derived.by(() => {
    const columns = getValue(props.columns);
    const hidden = Array.from(hiddenColumns);
    return columns.filter((col) => !hidden.includes(col.name));
  });

  /**
   * Définit l'état du modal de renommage
   */
  function setRenameModalOpen(open: boolean): void {
    renameModalOpen = open;
  }

  /**
   * Définit la colonne à renommer
   */
  function setColumnToRename(columnName: string | null): void {
    columnToRename = columnName;
  }

  /**
   * Renomme une colonne dans DuckDB
   */
  async function renameColumn(oldName: string, newName: string): Promise<void> {
    const tableName = getValue(props.tableName);

    if (!tableName) {
      return;
    }

    try {

      // Renommer dans DuckDB
      await duckDBOrchestrator.renameColumn(tableName, oldName, newName);

      // Notifier le parent si la colonne triée a été renommée
      props.onSortColumnRenamed?.(oldName, newName);

      // Mettre à jour les colonnes masquées si nécessaire
      if (hiddenColumns.has(oldName)) {
        hiddenColumns.delete(oldName);
        hiddenColumns.add(newName);
        hiddenColumns = new SvelteSet(hiddenColumns); // Force reactivity
      }

      // Recharger les données
      await props.onColumnsChange();

    } catch (err) {
      logger.error('Error renaming column', LogCategory.UI, err);
    }
  }

  /**
   * Supprime une colonne de la table DuckDB
   */
  async function dropColumn(columnName: string): Promise<void> {
    const tableName = getValue(props.tableName);

    if (!tableName) {
      return;
    }

    try {

      // Supprimer dans DuckDB
      await duckDBOrchestrator.dropColumn(tableName, columnName);

      // Notifier le parent si la colonne triée a été supprimée
      props.onSortColumnDeleted?.(columnName);

      // Retirer des colonnes masquées si nécessaire
      if (hiddenColumns.has(columnName)) {
        hiddenColumns.delete(columnName);
        hiddenColumns = new SvelteSet(hiddenColumns); // Force reactivity
      }

      // Recharger les données
      await props.onColumnsChange();

    } catch (err) {
      logger.error('Error dropping column', LogCategory.UI, err);
    }
  }

  /**
   * Masque ou affiche une colonne (toggle)
   */
  function toggleColumnVisibility(columnName: string): void {

    if (hiddenColumns.has(columnName)) {
      hiddenColumns.delete(columnName);
    } else {
      hiddenColumns.add(columnName);
    }

    // Force reactivity
    hiddenColumns = new SvelteSet(hiddenColumns);

  }

  /**
   * Ouvre le modal de renommage
   */
  function openRenameModal(columnName: string): void {
    columnToRename = columnName;
    renameModalOpen = true;
  }

  /**
   * Gestionnaire du modal de renommage
   */
  async function handleRename(newName: string): Promise<void> {
    if (!columnToRename) return;

    const oldName = columnToRename;

    await renameColumn(oldName, newName);

    // Fermer le modal
    renameModalOpen = false;
    columnToRename = null;
  }

  /**
   * Applique une opération de raffinement sur une colonne
   */
  async function handleRefine(
    columnName: string,
    operation: RefineOperation
  ): Promise<void> {
    const tableName = getValue(props.tableName);

    if (!tableName) {
      return;
    }

    try {

      // Appliquer l'opération de raffinement
      await duckDBOrchestrator.refineColumn(tableName, columnName, operation);

      // Recharger les données
      await props.onColumnsChange();

    } catch (err) {
      logger.error('Error refining column', LogCategory.UI, err);
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
    handleRefine
  };
}
