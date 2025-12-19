import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
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

const SOURCE_MAP: Record<string, string> = {
  numeric: 'Numérique',
  categorical: 'Catégorielle',
  text: 'Texte'
};

type SearchActions = {
  setSearchValue: (value: string) => void;
  setSelectedSource: (source: string) => void;
  setReplaceValue: (value: string) => void;
  performSearch: () => Promise<void>;
  replaceNext: () => Promise<boolean>;
  replaceAll: () => Promise<number>;
  goToNextResult: () => void;
  goToPreviousResult: () => void;
  goToResult: (index: number) => void;
  toggleCaseSensitive: () => void;
  toggleUseRegex: () => void;
  toggleWholeWord: () => void;
  clearSearch: () => void;
};

const { state, actions, getState } = createToolStore<
  SearchState,
  SearchActions
>(DEFAULT_STATE, (s) => {
  const performSearch = async (): Promise<void> => {
    const query = s.searchValue.trim().toLowerCase();
    if (!query) {
      s.results = [];
      s.currentResultIndex = 0;
      return;
    }

    s.isSearching = true;

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        let filteredResults = FIXTURE_RESULTS.filter((result) =>
          result.text.toLowerCase().includes(query)
        );

        if (s.selectedSource !== 'all') {
          const sourceFilter = SOURCE_MAP[s.selectedSource];
          if (sourceFilter) {
            filteredResults = filteredResults.filter((result) =>
              result.location.includes(sourceFilter)
            );
          }
        }

        s.results = filteredResults;
        s.currentResultIndex = 0;
        s.isSearching = false;
        resolve();
      }, 500);
    });
  };

  return {
    performSearch,
    setSearchValue: (value: string) => {
      s.searchValue = value;
      if (value.trim()) {
        performSearch();
      } else {
        s.results = [];
        s.currentResultIndex = 0;
      }
    },
    setSelectedSource: (source: string) => {
      s.selectedSource = source;
      if (s.searchValue.trim()) {
        performSearch();
      }
    },
    setReplaceValue: (value: string) => {
      s.replaceValue = value;
    },
    replaceNext: async (): Promise<boolean> => {
      if (!s.replaceValue.trim() || s.results.length === 0) {
        return false;
      }
      return true;
    },
    replaceAll: async (): Promise<number> => {
      if (!s.replaceValue.trim() || s.results.length === 0) {
        return 0;
      }
      const count = s.results.length;
      s.results = [];
      s.currentResultIndex = 0;
      return count;
    },
    goToNextResult: () => {
      if (s.results.length === 0) return;
      s.currentResultIndex = (s.currentResultIndex + 1) % s.results.length;
    },
    goToPreviousResult: () => {
      if (s.results.length === 0) return;
      s.currentResultIndex =
        s.currentResultIndex === 0
          ? s.results.length - 1
          : s.currentResultIndex - 1;
    },
    goToResult: (index: number) => {
      if (index >= 0 && index < s.results.length) {
        s.currentResultIndex = index;
      }
    },
    toggleCaseSensitive: () => {
      s.caseSensitive = !s.caseSensitive;
      if (s.searchValue.trim()) {
        performSearch();
      }
    },
    toggleUseRegex: () => {
      s.useRegex = !s.useRegex;
      if (s.searchValue.trim()) {
        performSearch();
      }
    },
    toggleWholeWord: () => {
      s.wholeWord = !s.wholeWord;
      if (s.searchValue.trim()) {
        performSearch();
      }
    },
    clearSearch: () => {
      s.searchValue = '';
      s.replaceValue = '';
      s.results = [];
      s.currentResultIndex = 0;
      s.isSearching = false;
    }
  };
});

export const searchState = state;
export const searchActions = actions;
export const getSearchState = getState;
