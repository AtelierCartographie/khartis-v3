/**
 * Types partagés pour le composant Advanced Data Table et ses sous-composants
 */

import type { ProcessedDataset } from '$lib/features/data-pipeline';

/**
 * Information basique sur une colonne
 */
export interface ColumnInfo {
  name: string;
  type: string;
}

/**
 * Type pour une ligne de tableau (objet clé-valeur)
 */
export type TableRow = Record<string, unknown>;

/**
 * Props du composant principal Advanced Data Table
 */
export interface AdvancedDataTableProps {
  /** Dataset traité à afficher (alternative à tableName) */
  dataset?: ProcessedDataset;

  /** Nom de la table DuckDB à afficher (alternative à dataset) */
  tableName?: string;

  /** IDs des lignes à mettre en surbrillance */
  highlightIds?: number[];

  /** Afficher les graphiques récapitulatifs des colonnes */
  showSummaryPlots?: boolean;

  /** Nombre maximum de lignes à afficher à la fois */
  maxRows?: number;
}

/**
 * Options pour récupérer les données d'une table
 */
export interface GetTableDataOptions {
  offset: number;
  limit: number;
  orderBy?: string | null;
  order?: 'ASC' | 'DESC' | null;
}

/**
 * Résultat de la récupération des données d'une table
 */
export interface TableDataResult {
  numRows: number;
  get(index: number): TableRow;
}

/**
 * Ordre de tri
 */
export type SortOrder = 'ASC' | 'DESC' | null;

/**
 * Options de configuration pour les graphiques récapitulatifs
 */
export interface PlotOptions {
  width: number;
  height: number;
  main_color: string;
  nulls_color: string;
}

/**
 * Colonnes à exclure par défaut
 */
export const EXCLUDED_COLUMNS = ['geom', 'geometry', '__id'] as const;
