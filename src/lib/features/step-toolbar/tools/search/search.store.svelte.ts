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
    console.log('[Search] 🔄 State updated:', newState);
  },

  setSearchValue(value: string): void {
    searchState.searchValue = value;
    console.log('[Search] 🔍 Search value changed to:', value);

    if (value.trim()) {
      this.performSearch();
    } else {
      searchState.results = [];
      searchState.currentResultIndex = 0;
    }
  },

  setSelectedSource(source: string): void {
    searchState.selectedSource = source;
    console.log('[Search] 📊 Source filter changed to:', source);

    if (searchState.searchValue.trim()) {
      this.performSearch();
    }
  },

  setReplaceValue(value: string): void {
    searchState.replaceValue = value;
    console.log('[Search] ✏️ Replace value set to:', value);
  },

  async performSearch(): Promise<void> {
    const query = searchState.searchValue.trim().toLowerCase();
    if (!query) {
      searchState.results = [];
      searchState.currentResultIndex = 0;
      return;
    }

    searchState.isSearching = true;
    console.log('[Search] 🔍 Performing search for:', query);
    console.log('[Search] 📊 Source filter:', searchState.selectedSource);

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

      console.log('[Search] ✅ Found', filteredResults.length, 'results');
      filteredResults.forEach((result, index) => {
        console.log(
          `[Search]   ${index + 1}. ${result.text} (${result.location})`
        );
      });
    }, 500);
  },

  async replaceNext(): Promise<boolean> {
    if (!searchState.replaceValue.trim()) {
      console.log('[Search] ❌ Replace cancelled - no replace value');
      return false;
    }

    if (searchState.results.length === 0) {
      console.log('[Search] ❌ Replace cancelled - no search results');
      return false;
    }

    const currentResult = searchState.results[searchState.currentResultIndex];
    console.log(
      '[Search] 🔄 Replacing next occurrence in:',
      currentResult?.text
    );
    console.log('[Search] 📝 Would replace in 1 location (mock)');

    return true;
  },

  async replaceAll(): Promise<number> {
    if (!searchState.replaceValue.trim()) {
      console.log('[Search] ❌ Replace all cancelled - no replace value');
      return 0;
    }

    if (searchState.results.length === 0) {
      console.log('[Search] ❌ Replace all cancelled - no search results');
      return 0;
    }

    const count = searchState.results.length;
    console.log(
      '[Search] 🔄 Replacing "' +
        searchState.searchValue +
        '" with "' +
        searchState.replaceValue +
        '"'
    );
    console.log('[Search] 📝 Would replace in', count, 'locations (mock)');

    searchState.results = [];
    searchState.currentResultIndex = 0;

    console.log('[Search] ✅ Replace all completed (mock)');
    return count;
  },

  goToNextResult(): void {
    if (searchState.results.length === 0) {
      console.log('[Search] ❌ No results to navigate');
      return;
    }

    searchState.currentResultIndex =
      (searchState.currentResultIndex + 1) % searchState.results.length;

    const result = searchState.results[searchState.currentResultIndex];
    console.log('[Search] 📍 Next result:', result.text, 'at', result.location);
  },

  goToPreviousResult(): void {
    if (searchState.results.length === 0) {
      console.log('[Search] ❌ No results to navigate');
      return;
    }

    searchState.currentResultIndex =
      searchState.currentResultIndex === 0
        ? searchState.results.length - 1
        : searchState.currentResultIndex - 1;

    const result = searchState.results[searchState.currentResultIndex];
    console.log(
      '[Search] 📍 Previous result:',
      result.text,
      'at',
      result.location
    );
  },

  goToResult(index: number): void {
    if (index >= 0 && index < searchState.results.length) {
      searchState.currentResultIndex = index;
      const result = searchState.results[index];
      console.log(
        '[Search] 📍 Navigated to:',
        result.text,
        'at',
        result.location
      );
    } else {
      console.log('[Search] ❌ Invalid result index:', index);
    }
  },

  toggleCaseSensitive(): void {
    searchState.caseSensitive = !searchState.caseSensitive;
    console.log('[Search] 🔤 Case sensitive:', searchState.caseSensitive);
    if (searchState.searchValue.trim()) {
      this.performSearch();
    }
  },

  toggleUseRegex(): void {
    searchState.useRegex = !searchState.useRegex;
    console.log('[Search] 🔧 Use regex:', searchState.useRegex);
    if (searchState.searchValue.trim()) {
      this.performSearch();
    }
  },

  toggleWholeWord(): void {
    searchState.wholeWord = !searchState.wholeWord;
    console.log('[Search] 📝 Whole word:', searchState.wholeWord);
    if (searchState.searchValue.trim()) {
      this.performSearch();
    }
  },

  clearSearch(): void {
    console.log('[Search] 🧹 Clearing search');
    Object.assign(searchState, {
      searchValue: '',
      replaceValue: '',
      results: [],
      currentResultIndex: 0,
      isSearching: false
    });
  },

  reset(): void {
    console.log('[Search] 🔄 Reset to default state');
    Object.assign(searchState, DEFAULT_STATE);
  }
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
    console.error('[Search] Invalid regex pattern:', error);
    return searchState.searchValue;
  }
}
