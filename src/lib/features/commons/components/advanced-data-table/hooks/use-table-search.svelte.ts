/**
 * Hook pour la gestion de la recherche et du remplacement dans le tableau
 * Utilise DuckDB pour la recherche fuzzy avec Jaro-Winkler similarity
 */

import { duckDBOrchestrator } from '$lib/features/duckdb';
import { logger, LogCategory } from '../../../utils/logger';
import { debounce } from '../../../utils/debounce.utils';

export interface UseTableSearchProps {
  /** Nom de la table DuckDB (requis pour la recherche) */
  tableName: string | (() => string | undefined);

  /**
   * Callback pour naviguer vers une ligne spécifique
   * @param id ID de la ligne (1-based)
   */
  onNavigate: (id: number) => void;

  /**
   * Callback après un remplacement (pour recharger les données)
   */
  onReplace: () => Promise<void>;

  /**
   * Seuil de similarité Jaro-Winkler (0-1, default: 0.6)
   */
  threshold?: number;

  /**
   * Colonne spécifique à rechercher (optionnel, null = toutes les colonnes)
   */
  column?: string | null | (() => string | null | undefined);
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

  /** Indique si une recherche est en cours */
  isSearching: boolean;

  /**
   * Définit la requête de recherche
   */
  setSearchQuery: (query: string) => void;

  /**
   * Définit la valeur de remplacement
   */
  setReplaceValue: (value: string) => void;

  /**
   * Effectue la recherche dans les données via DuckDB
   */
  performSearch: () => Promise<void>;

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
 * Hook de gestion de la recherche et du remplacement via DuckDB
 *
 * Utilise la recherche fuzzy avec Jaro-Winkler similarity et LIKE fallback.
 *
 * @example
 * ```typescript
 * const search = useTableSearch({
 *   tableName: 'my_table',
 *   onNavigate: virtualScroll.goToId,
 *   onReplace: async () => {
 *     await tableData.loadColumnsInfo();
 *     await virtualScroll.initializeRows(0);
 *   },
 *   threshold: 0.6
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
  let isSearching = $state<boolean>(false);

  const threshold = props.threshold ?? 0.6;

  /**
   * Effectue la recherche via DuckDB (debounced pour performance)
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
   * Effectue une recherche fuzzy via DuckDB
   * Utilise Jaro-Winkler similarity + LIKE fallback
   */
  async function performSearch(): Promise<void> {
    const tableName = getValue(props.tableName);
    const column = props.column ? getValue(props.column) : undefined;

    if (!searchQuery.trim() || !tableName) {
      searchResults = [];
      currentSearchIndex = 0;
      return;
    }

    isSearching = true;

    try {
      const results = await duckDBOrchestrator.searchInTable(
        tableName,
        searchQuery,
        {
          threshold,
          column: column ?? undefined
        }
      );

      searchResults = results;
      currentSearchIndex = results.length > 0 ? 0 : -1;

      // Naviguer vers le premier résultat
      if (results.length > 0) {
        props.onNavigate(results[0]);
      }
    } catch (err) {
      logger.error('Error searching in table', LogCategory.UI, err);
      searchResults = [];
      currentSearchIndex = 0;
    } finally {
      isSearching = false;
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
    const column = props.column ? getValue(props.column) : '';

    if (!tableName || !searchQuery || !replaceValue) {
      return;
    }

    try {
      // Effectuer le remplacement dans DuckDB
      await duckDBOrchestrator.replaceInColumn(
        tableName,
        column ?? '', // Colonne vide = toutes les colonnes
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
    get isSearching() {
      return isSearching;
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
