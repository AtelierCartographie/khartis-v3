import { createResetFunction } from '$lib/features/commons/utils/store.utils';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import type { SearchState } from './search.types';

const FIXTURE_RESULTS = [
  {
    id: 'var-population',
    text: 'Population totale par région',
    location: 'Variables > Numérique'
  },
  {
    id: 'var-gdp',
    text: 'PIB par habitant',
    location: 'Variables > Numérique'
  },
  {
    id: 'var-country',
    text: 'Nom du pays',
    location: 'Variables > Texte'
  },
  {
    id: 'var-region',
    text: 'Région administrative',
    location: 'Variables > Catégorielle'
  }
];

const DEFAULT_STATE: SearchState = {
  searchValue: '',
  selectedSource: 'all',
  replaceValue: '',
  results: [],
  currentResultIndex: 0,
  isSearching: false,
  caseSensitive: false,
  wholeWord: false,
  useRegex: false
};

export const searchState = $state<SearchState>({ ...DEFAULT_STATE });

export const searchActions = {
  setState(newState: Partial<SearchState>): void {
    Object.assign(searchState, newState);
  },

  setSearchValue(value: string): void {
    searchState.searchValue = value;

    if (value.trim()) {
      this.performSearch();
    } else {
      searchState.results = [];
      searchState.currentResultIndex = 0;
    }
  },

  setSelectedSource(source: string): void {
    searchState.selectedSource = source;

    if (searchState.searchValue.trim()) {
      this.performSearch();
    }
  },

  setReplaceValue(value: string): void {
    searchState.replaceValue = value;
  },

  async performSearch(): Promise<void> {
    const query = searchState.searchValue.trim().toLowerCase();
    if (!query) {
      searchState.results = [];
      searchState.currentResultIndex = 0;
      return;
    }

    searchState.isSearching = true;

    setTimeout(() => {
      let filteredResults = FIXTURE_RESULTS.filter((result) =>
        result.text.toLowerCase().includes(query)
      );

      if (searchState.selectedSource !== 'all') {
        const sourceMap = {
          numeric: 'Numérique',
          categorical: 'Catégorielle',
          text: 'Texte'
        };
        const sourceFilter =
          sourceMap[searchState.selectedSource as keyof typeof sourceMap];
        if (sourceFilter) {
          filteredResults = filteredResults.filter((result) =>
            result.location.includes(sourceFilter)
          );
        }
      }

      searchState.results = filteredResults;
      searchState.currentResultIndex = filteredResults.length > 0 ? 0 : 0;
      searchState.isSearching = false;
    }, 500);
  },

  async replaceNext(): Promise<boolean> {
    if (!searchState.replaceValue.trim()) {
      return false;
    }

    if (searchState.results.length === 0) {
      return false;
    }

    return true;
  },

  async replaceAll(): Promise<number> {
    if (!searchState.replaceValue.trim()) {
      return 0;
    }

    if (searchState.results.length === 0) {
      return 0;
    }

    const count = searchState.results.length;
    searchState.results = [];
    searchState.currentResultIndex = 0;
    return count;
  },

  goToNextResult(): void {
    if (searchState.results.length === 0) {
      return;
    }

    searchState.currentResultIndex =
      (searchState.currentResultIndex + 1) % searchState.results.length;
  },

  goToPreviousResult(): void {
    if (searchState.results.length === 0) {
      return;
    }

    searchState.currentResultIndex =
      searchState.currentResultIndex === 0
        ? searchState.results.length - 1
        : searchState.currentResultIndex - 1;
  },

  goToResult(index: number): void {
    if (index >= 0 && index < searchState.results.length) {
      searchState.currentResultIndex = index;
    }
  },

  toggleCaseSensitive(): void {
    searchState.caseSensitive = !searchState.caseSensitive;
    if (searchState.searchValue.trim()) {
      this.performSearch();
    }
  },

  toggleUseRegex(): void {
    searchState.useRegex = !searchState.useRegex;
    if (searchState.searchValue.trim()) {
      this.performSearch();
    }
  },

  toggleWholeWord(): void {
    searchState.wholeWord = !searchState.wholeWord;
    if (searchState.searchValue.trim()) {
      this.performSearch();
    }
  },

  clearSearch(): void {
    Object.assign(searchState, {
      searchValue: '',
      replaceValue: '',
      results: [],
      currentResultIndex: 0,
      isSearching: false
    });
  },

  reset: createResetFunction(searchState, DEFAULT_STATE)
};

export function getSearchPattern(): RegExp | string {
  let pattern = searchState.searchValue;

  if (!searchState.useRegex) {
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  if (searchState.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }

  try {
    return new RegExp(pattern, searchState.caseSensitive ? 'g' : 'gi');
  } catch (error) {
    logger.error('Invalid regex pattern', LogCategory.UI, error);
    return searchState.searchValue;
  }
}
