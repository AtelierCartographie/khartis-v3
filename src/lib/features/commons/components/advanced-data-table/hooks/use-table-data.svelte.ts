/**
 * Hook pour la gestion du chargement et de la mise à jour des données du tableau
 * Gère à la fois les données DuckDB (tableName) et les datasets traités
 */

import { duckDBOrchestrator, type AnalysisResult } from '$lib/features/duckdb';
import type { ProcessedDataset } from '$lib/features/data-pipeline';
import { SvelteMap } from 'svelte/reactivity';
import { LogCategory, logger } from '../../../utils/logger';
import type { ColumnInfo, SortOrder, TableRow } from '../types';

export interface UseTableDataProps {
  /** Nom de la table DuckDB (optionnel) */
  tableName?: string | (() => string | undefined);

  /** Dataset traité (optionnel, alternative à tableName) */
  dataset?: ProcessedDataset | (() => ProcessedDataset | undefined);

  /** Index de départ pour le chargement des données */
  startIndex: number | (() => number);

  /** Indices des lignes à charger */
  rowIndices: number[] | (() => number[]);

  /** Colonne de tri (optionnel) */
  sortColumn?: string | null | (() => string | null);

  /** Ordre de tri (optionnel) */
  sortOrder?: SortOrder | (() => SortOrder);
}

export interface UseTableDataReturn {
  /** Liste des colonnes du tableau */
  columns: ColumnInfo[];

  /** Analyse détaillée de chaque colonne */
  columnAnalysis: Map<string, AnalysisResult>;

  /** Données des lignes chargées */
  tableData: TableRow[];

  /** Nombre total de lignes dans le tableau */
  numRows: number;

  /** État de chargement */
  isLoading: boolean;

  /** Message d'erreur éventuel */
  error: string | null;

  /**
   * Charge les informations et analyses des colonnes
   */
  loadColumnsInfo: () => Promise<void>;

  /**
   * Charge les données des lignes
   */
  loadRowsData: () => Promise<void>;

  /**
   * Réinitialise le state de tri si la colonne n'existe plus
   * @param currentSortColumn Colonne de tri actuelle
   * @param onReset Callback à appeler pour réinitialiser le tri
   */
  validateSortColumn: (
    currentSortColumn: string | null,
    onReset: () => void
  ) => void;
}

/**
 * Colonnes à exclure par défaut de l'affichage
 */
const EXCLUDED_COLUMNS = ['geom', 'geometry', '__id'];

/**
 * Obtient la valeur d'une prop (fonction ou valeur directe)
 */
function getValue<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop;
}

/**
 * Hook de gestion des données du tableau
 *
 * @example
 * ```typescript
 * const tableData = useTableData({
 *   tableName: 'my_table',
 *   startIndex: () => virtualScroll.startIndex,
 *   rowIndices: () => virtualScroll.rows,
 *   sortColumn: () => sort.sortColumn,
 *   sortOrder: () => sort.sortOrder
 * });
 *
 * // Charger les données
 * await tableData.loadColumnsInfo();
 * await tableData.loadRowsData();
 * ```
 */
export function useTableData(props: UseTableDataProps): UseTableDataReturn {
  let columns = $state<ColumnInfo[]>([]);
  let columnAnalysis = new SvelteMap<string, AnalysisResult>();
  let tableData = $state<TableRow[]>([]);
  let numRows = $state<number>(0);
  let isLoading = $state<boolean>(false);
  let error = $state<string | null>(null);

  /**
   * Charge les informations sur les colonnes (avec analyse pour DuckDB)
   */
  async function loadColumnsInfo(): Promise<void> {
    const tableName = getValue(props.tableName);
    const dataset = getValue(props.dataset);

    try {
      isLoading = true;
      error = null;

      if (tableName) {
        // Chargement depuis DuckDB avec analyse complète

        const analysis = await duckDBOrchestrator.getFullAnalysis(tableName);


        // Filtrer les colonnes exclues
        const filteredAnalysis = analysis.filter(
          (a: AnalysisResult) => !EXCLUDED_COLUMNS.includes(a.name)
        );

        // Créer la liste des colonnes
        columns = filteredAnalysis.map((a: AnalysisResult) => ({
          name: a.name,
          type: a.type_simple
        }));

        // Créer la map d'analyse
        const analysisMap = new SvelteMap<string, AnalysisResult>();
        filteredAnalysis.forEach((a: AnalysisResult) => {
          analysisMap.set(a.name, a);
        });
        columnAnalysis = analysisMap;


        // Récupérer le nombre de lignes
        const count = await duckDBOrchestrator.getRowCount(tableName);
        numRows = count;
      } else if (dataset) {
        // Chargement depuis un dataset (pas d'analyse)

        columns = dataset.columns.filter(
          (c) => !EXCLUDED_COLUMNS.includes(c.name)
        );

        numRows = dataset.data.length;

        // Pas d'analyse pour les datasets
        columnAnalysis = new SvelteMap();
      } else {
        // Aucune source de données
        columns = [];
        columnAnalysis = new SvelteMap();
        numRows = 0;
      }
    } catch (err) {
      logger.error('Error loading columns info', LogCategory.UI, err);
      error = err instanceof Error ? err.message : 'Failed to load columns';
      columns = [];
      columnAnalysis = new SvelteMap();
      numRows = 0;
    } finally {
      isLoading = false;
    }
  }

  /**
   * Charge les données des lignes spécifiées
   */
  async function loadRowsData(): Promise<void> {
    const tableName = getValue(props.tableName);
    const dataset = getValue(props.dataset);
    const rowIndices = getValue(props.rowIndices);
    const sortColumn = getValue(props.sortColumn);
    const sortOrder = getValue(props.sortOrder);

    if (!tableName && !dataset) {
      tableData = [];
      return;
    }

    if (rowIndices.length === 0) {
      tableData = [];
      return;
    }

    try {
      if (tableName) {
        // Chargement depuis DuckDB
        const data = await duckDBOrchestrator.getTableData(tableName, {
          offset: rowIndices[0],
          limit: rowIndices.length,
          orderBy: sortColumn,
          order: sortOrder
        });

        if (data && data.numRows > 0) {
          const rows: TableRow[] = [];
          for (let i = 0; i < data.numRows; i++) {
            rows.push(data.get(i));
          }
          tableData = rows;
        } else {
          tableData = [];
        }
      } else if (dataset) {
        // Chargement depuis dataset (slice)
        const startIdx = rowIndices[0];
        const endIdx = startIdx + rowIndices.length;
        tableData = dataset.data.slice(startIdx, endIdx);
      }
    } catch (err) {
      logger.error('Error loading row data', LogCategory.UI, err);
      error = err instanceof Error ? err.message : 'Failed to load data';
      tableData = [];
    }
  }

  /**
   * Valide que la colonne de tri existe toujours dans les colonnes
   * Appelle onReset si la colonne n'existe pas
   */
  function validateSortColumn(
    currentSortColumn: string | null,
    onReset: () => void
  ): void {
    if (
      currentSortColumn &&
      !columns.some((c) => c.name === currentSortColumn)
    ) {
      onReset();
    }
  }

  return {
    get columns() {
      return columns;
    },
    get columnAnalysis() {
      return columnAnalysis;
    },
    get tableData() {
      return tableData;
    },
    get numRows() {
      return numRows;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    loadColumnsInfo,
    loadRowsData,
    validateSortColumn
  };
}
