export interface SearchState {
  searchValue: string;
  selectedSource: string;
  results: Array<{
    rowId: number;
    columnName: string;
    value: string;
    score: number;
  }>;
  currentResultIndex: number;
  isSearching: boolean;
  caseSensitive: boolean;
  wholeWord: boolean;
  isSampled: boolean;
}
