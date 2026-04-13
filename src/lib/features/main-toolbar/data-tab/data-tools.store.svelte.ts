import { SearchSource } from '../constants';
import {
  SavePriority,
  persistenceRegistry
} from '$lib/features/project-management/core/persistence-registry';

export enum DataToolType {
  None = 'none',
  Search = 'search',
  Filters = 'filters',
  Calculator = 'calculator'
}

export interface DataToolsState {
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

function notifyPersistence(
  priority: keyof typeof SavePriority = 'DEBOUNCED'
): void {
  persistenceRegistry.notifyChange('dataTools', SavePriority[priority]);
}

function restoreFromSerialized(data: unknown): void {
  const restored = data as Partial<DataToolsState> | undefined;

  state.activeTool = restored?.activeTool ?? DataToolType.None;
  state.searchQuery = restored?.searchQuery ?? '';
  state.searchSource = restored?.searchSource ?? SearchSource.ALL;
  state.replaceValue = restored?.replaceValue ?? '';
  state.calculatorName = restored?.calculatorName ?? '';
  state.calculatorFormula = restored?.calculatorFormula ?? '';
  state.calculatorTestResult = null;
  state.calculatorError = null;
}

function openTool(tool: DataToolType) {
  state.activeTool = tool;
  notifyPersistence('IMMEDIATE');
}

function closeTool() {
  state.activeTool = DataToolType.None;
  notifyPersistence('IMMEDIATE');
}

function toggleTool(tool: DataToolType) {
  state.activeTool = state.activeTool === tool ? DataToolType.None : tool;
  notifyPersistence('IMMEDIATE');
}

function setSearchQuery(query: string) {
  state.searchQuery = query;
  notifyPersistence('IMMEDIATE');
}

function setSearchSource(source: SearchSource | string) {
  state.searchSource = source;
  notifyPersistence('IMMEDIATE');
}

function setReplaceValue(value: string) {
  state.replaceValue = value;
  notifyPersistence('IMMEDIATE');
}

function setCalculatorName(name: string) {
  state.calculatorName = name;
  notifyPersistence('IMMEDIATE');
}

function setCalculatorFormula(formula: string) {
  state.calculatorFormula = formula;
  notifyPersistence('IMMEDIATE');
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
  notifyPersistence('IMMEDIATE');
}

function resetSearch() {
  state.searchQuery = '';
  state.searchSource = SearchSource.ALL;
  state.replaceValue = '';
  notifyPersistence('IMMEDIATE');
}

function reset() {
  restoreFromSerialized(undefined);
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

persistenceRegistry.register({
  key: 'dataTools',
  serialize: () => ({
    activeTool: state.activeTool,
    searchQuery: state.searchQuery,
    searchSource: state.searchSource,
    replaceValue: state.replaceValue,
    calculatorName: state.calculatorName,
    calculatorFormula: state.calculatorFormula
  }),
  deserialize: (data: unknown) => restoreFromSerialized(data),
  reset,
  priority: 'debounced'
});
