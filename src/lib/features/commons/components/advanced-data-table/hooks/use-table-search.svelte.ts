/**
 * Hook pour la gestion de la recherche et du remplacement dans le tableau
 * Permet de rechercher dans toutes les colonnes et de remplacer des valeurs
 */

import { duckDBOrchestrator } from '$lib/features/duckdb';
import { logger, LogCategory } from '../../../utils/logger';
import { debounce } from '../../../utils/debounce.utils';
import type { TableRow } from '../types';

export interface UseTableSearchProps {
  /** Données du tableau */
  tableData: TableRow[] | (() => TableRow[]);

  /** Indices des lignes affichées */
  rows: number[] | (() => number[]);

  /** Nom de la table DuckDB (pour le remplacement) */
  tableName?: string | (() => string | undefined);

  /**
   * Callback pour naviguer vers une ligne spécifique
   * @param id ID de la ligne (1-based)
   */
  onNavigate: (id: number) => void;

  /**
   * Callback après un remplacement (pour recharger les données)
   */
  onReplace: () => Promise<void>;
}

export interface UseTableSearchReturn {
  /** Requête de recherche */
  searchQuery: string;

  /** Valeur de remplacement */
  replaceValue: string;

  /** IDs des lignes contenant la recherche */
  searchResults: number[];

  /** Index actuel dans les résultats de recherche */
  currentSearchIndex: number;

  /**
   * Définit la requête de recherche
   */
  setSearchQuery: (query: string) => void;

  /**
   * Définit la valeur de remplacement
   */
  setReplaceValue: (value: string) => void;

  /**
   * Effectue la recherche dans les données
   */
  performSearch: () => void;

  /**
   * Navigue vers le résultat suivant
   */
  goToNextSearchResult: () => void;

  /**
   * Navigue vers le résultat précédent
   */
  goToPreviousSearchResult: () => void;

  /**
   * Réinitialise la recherche
   */
  clearSearch: () => void;

  /**
   * Remplace toutes les occurrences de la recherche
   * Nécessite tableName (fonctionne uniquement avec DuckDB)
   */
  handleReplace: () => Promise<void>;
}

/**
 * Obtient la valeur d'une prop (fonction ou valeur directe)
 */
function getValue<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop;
}

/**
 * Hook de gestion de la recherche et du remplacement
 *
 * @example
 * ```typescript
 * const search = useTableSearch({
 *   tableData: () => tableData.tableData,
 *   rows: () => virtualScroll.rows,
 *   tableName: 'my_table',
 *   onNavigate: virtualScroll.goToId,
 *   onReplace: async () => {
 *     await tableData.loadColumnsInfo();
 *     await virtualScroll.initializeRows(0);
 *   }
 * });
 *
 * // Dans le template
 * <input bind:value={search.searchQuery} />
 * <button onclick={search.performSearch}>Rechercher</button>
 * ```
 */
export function useTableSearch(
  props: UseTableSearchProps
): UseTableSearchReturn {
  let searchQuery = $state<string>('');
  let replaceValue = $state<string>('');
  let searchResults = $state<number[]>([]);
  let currentSearchIndex = $state<number>(0);

  /**
   * Effectue la recherche (debounced pour performance)
   */
  const debouncedSearch = debounce(() => {
    performSearch();
  }, 300);

  /**
   * Définit la requête de recherche et lance la recherche debounced
   */
  function setSearchQuery(query: string): void {
    searchQuery = query;
    debouncedSearch();
  }

  /**
   * Définit la valeur de remplacement
   */
  function setReplaceValue(value: string): void {
    replaceValue = value;
  }

  /**
   * Effectue une recherche case-insensitive dans toutes les colonnes
   */
  function performSearch(): void {
    if (!searchQuery.trim()) {
      searchResults = [];
      currentSearchIndex = 0;
      return;
    }

    const tableData = getValue(props.tableData);
    const rows = getValue(props.rows);
    const query = searchQuery.toLowerCase();
    const results: number[] = [];

    // Rechercher dans chaque ligne
    tableData.forEach((row, index) => {
      const rowIndex = rows[index];
      const values = Object.values(row);

      // Vérifier si au moins une valeur contient la recherche
      const hasMatch = values.some((value) => {
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(query);
      });

      if (hasMatch) {
        // Ajouter l'ID de la ligne (1-based)
        results.push(rowIndex + 1);
      }
    });

    searchResults = results;
    currentSearchIndex = 0;

    // Naviguer vers le premier résultat
    if (results.length > 0) {
      props.onNavigate(results[0]);
    }
  }

  /**
   * Navigue vers le résultat de recherche suivant (cyclique)
   */
  function goToNextSearchResult(): void {
    if (searchResults.length === 0) return;

    currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
    props.onNavigate(searchResults[currentSearchIndex]);
  }

  /**
   * Navigue vers le résultat de recherche précédent (cyclique)
   */
  function goToPreviousSearchResult(): void {
    if (searchResults.length === 0) return;

    currentSearchIndex =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    props.onNavigate(searchResults[currentSearchIndex]);
  }

  /**
   * Réinitialise complètement la recherche
   */
  function clearSearch(): void {
    searchQuery = '';
    replaceValue = '';
    searchResults = [];
    currentSearchIndex = 0;
  }

  /**
   * Remplace toutes les occurrences dans la table DuckDB
   * Nécessite que tableName soit défini
   */
  async function handleReplace(): Promise<void> {
    const tableName = getValue(props.tableName);

    if (!tableName || !searchQuery || !replaceValue) {
      return;
    }

    try {
      // Effectuer le remplacement dans DuckDB
      const count = await duckDBOrchestrator.replaceInColumn(
        tableName,
        '', // Colonne vide = toutes les colonnes
        searchQuery,
        replaceValue
      );

      // Réinitialiser la recherche
      clearSearch();

      // Recharger les données
      await props.onReplace();

    } catch (err) {
      logger.error('Error replacing values', LogCategory.UI, err);
    }
  }

  return {
    get searchQuery() {
      return searchQuery;
    },
    get replaceValue() {
      return replaceValue;
    },
    get searchResults() {
      return searchResults;
    },
    get currentSearchIndex() {
      return currentSearchIndex;
    },
    setSearchQuery,
    setReplaceValue,
    performSearch,
    goToNextSearchResult,
    goToPreviousSearchResult,
    clearSearch,
    handleReplace
  };
}
