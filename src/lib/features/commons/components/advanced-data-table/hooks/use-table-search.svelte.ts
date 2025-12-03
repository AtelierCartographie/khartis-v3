import { duckDBOrchestrator } from '$lib/features/duckdb';
import { logger, LogCategory } from '../../../utils/logger';
import { debounce } from '../../../utils/debounce.utils';

export interface UseTableSearchProps {
  tableName: string | (() => string | undefined);
  onNavigate: (id: number) => void;
  onReplace: () => Promise<void>;
  threshold?: number;
  column?: string | null | (() => string | null | undefined);
}

export interface UseTableSearchReturn {
  searchQuery: string;
  replaceValue: string;
  searchResults: number[];
  currentSearchIndex: number;
  isSearching: boolean;
  setSearchQuery: (query: string) => void;
  setReplaceValue: (value: string) => void;
  performSearch: () => Promise<void>;
  goToNextSearchResult: () => void;
  goToPreviousSearchResult: () => void;
  clearSearch: () => void;
  handleReplace: () => Promise<void>;
}

function getValue<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop;
}

export function useTableSearch(
  props: UseTableSearchProps
): UseTableSearchReturn {
  let searchQuery = $state<string>('');
  let replaceValue = $state<string>('');
  let searchResults = $state<number[]>([]);
  let currentSearchIndex = $state<number>(0);
  let isSearching = $state<boolean>(false);

  const threshold = props.threshold ?? 0.6;

  const debouncedSearch = debounce(() => {
    performSearch();
  }, 300);

  function setSearchQuery(query: string): void {
    searchQuery = query;
    debouncedSearch();
  }

  function setReplaceValue(value: string): void {
    replaceValue = value;
  }

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

  function goToNextSearchResult(): void {
    if (searchResults.length === 0) return;

    currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
    props.onNavigate(searchResults[currentSearchIndex]);
  }

  function goToPreviousSearchResult(): void {
    if (searchResults.length === 0) return;

    currentSearchIndex =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    props.onNavigate(searchResults[currentSearchIndex]);
  }

  function clearSearch(): void {
    searchQuery = '';
    replaceValue = '';
    searchResults = [];
    currentSearchIndex = 0;
  }

  async function handleReplace(): Promise<void> {
    const tableName = getValue(props.tableName);
    const column = props.column ? getValue(props.column) : '';

    if (!tableName || !searchQuery || !replaceValue) {
      return;
    }

    try {
      await duckDBOrchestrator.replaceInColumn(
        tableName,
        column ?? '',
        searchQuery,
        replaceValue
      );

      clearSearch();
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
