import { SearchSource } from '../constants';

export enum DataToolType {
  None = 'none',
  Search = 'search',
  Filters = 'filters',
  Calculator = 'calculator'
}

interface DataToolsState {
  activeTool: DataToolType;
  searchQuery: string;
  searchSource: SearchSource | string;
  replaceValue: string;
  calculatorName: string;
  calculatorFormula: string;
  calculatorTestResult: unknown;
  calculatorError: string | null;
}

const state = $state<DataToolsState>({
  activeTool: DataToolType.None,
  searchQuery: '',
  searchSource: SearchSource.ALL,
  replaceValue: '',
  calculatorName: '',
  calculatorFormula: '',
  calculatorTestResult: null,
  calculatorError: null
});

function openTool(tool: DataToolType) {
  state.activeTool = tool;
}

function closeTool() {
  state.activeTool = DataToolType.None;
}

function toggleTool(tool: DataToolType) {
  state.activeTool = state.activeTool === tool ? DataToolType.None : tool;
}

function setSearchQuery(query: string) {
  state.searchQuery = query;
}

function setSearchSource(source: SearchSource | string) {
  state.searchSource = source;
}

function setReplaceValue(value: string) {
  state.replaceValue = value;
}

function setCalculatorName(name: string) {
  state.calculatorName = name;
}

function setCalculatorFormula(formula: string) {
  state.calculatorFormula = formula;
}

function setCalculatorTestResult(result: unknown) {
  state.calculatorTestResult = result;
  state.calculatorError = null;
}

function setCalculatorError(error: string | null) {
  state.calculatorError = error;
  state.calculatorTestResult = null;
}

function resetCalculator() {
  state.calculatorName = '';
  state.calculatorFormula = '';
  state.calculatorTestResult = null;
  state.calculatorError = null;
}

function resetSearch() {
  state.searchQuery = '';
  state.searchSource = SearchSource.ALL;
  state.replaceValue = '';
}

function reset() {
  state.activeTool = DataToolType.None;
  resetSearch();
  resetCalculator();
}

export const dataToolsStore = {
  get activeTool() {
    return state.activeTool;
  },
  get isOpen() {
    return state.activeTool !== DataToolType.None;
  },
  get searchQuery() {
    return state.searchQuery;
  },
  get searchSource() {
    return state.searchSource;
  },
  get replaceValue() {
    return state.replaceValue;
  },
  get calculatorName() {
    return state.calculatorName;
  },
  get calculatorFormula() {
    return state.calculatorFormula;
  },
  get calculatorTestResult() {
    return state.calculatorTestResult;
  },
  get calculatorError() {
    return state.calculatorError;
  },
  openTool,
  closeTool,
  toggleTool,
  setSearchQuery,
  setSearchSource,
  setReplaceValue,
  setCalculatorName,
  setCalculatorFormula,
  setCalculatorTestResult,
  setCalculatorError,
  resetCalculator,
  resetSearch,
  reset
};
