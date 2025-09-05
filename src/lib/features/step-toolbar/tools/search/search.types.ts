export interface SearchState {
  searchValue: string;
  selectedSource: string;
  replaceValue: string;
  results: Array<{
    id: string;
    text: string;
    location: string;
    layerId?: string;
  }>;
  currentResultIndex: number;
  isSearching: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}
