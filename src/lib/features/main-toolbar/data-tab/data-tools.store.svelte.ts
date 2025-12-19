export enum DataToolType {
  None = 'none',
  Search = 'search',
  Filters = 'filters',
  Calculator = 'calculator'
}

interface DataToolsState {
  activeTool: DataToolType;
  searchQuery: string;
  searchSource: string;
  replaceValue: string;
  calculatorName: string;
  calculatorFormula: string;
  calculatorTestResult: unknown;
  calculatorError: string | null;
}

class DataToolsStore {
  private _state = $state<DataToolsState>({
    activeTool: DataToolType.None,
    searchQuery: '',
    searchSource: 'all',
    replaceValue: '',
    calculatorName: '',
    calculatorFormula: '',
    calculatorTestResult: null,
    calculatorError: null
  });

  get activeTool() {
    return this._state.activeTool;
  }

  get isOpen() {
    return this._state.activeTool !== DataToolType.None;
  }

  get searchQuery() {
    return this._state.searchQuery;
  }

  get searchSource() {
    return this._state.searchSource;
  }

  get replaceValue() {
    return this._state.replaceValue;
  }

  get calculatorName() {
    return this._state.calculatorName;
  }

  get calculatorFormula() {
    return this._state.calculatorFormula;
  }

  get calculatorTestResult() {
    return this._state.calculatorTestResult;
  }

  get calculatorError() {
    return this._state.calculatorError;
  }

  openTool(tool: DataToolType) {
    this._state.activeTool = tool;
  }

  closeTool() {
    this._state.activeTool = DataToolType.None;
  }

  toggleTool(tool: DataToolType) {
    this._state.activeTool =
      this._state.activeTool === tool ? DataToolType.None : tool;
  }

  setSearchQuery(query: string) {
    this._state.searchQuery = query;
  }

  setSearchSource(source: string) {
    this._state.searchSource = source;
  }

  setReplaceValue(value: string) {
    this._state.replaceValue = value;
  }

  setCalculatorName(name: string) {
    this._state.calculatorName = name;
  }

  setCalculatorFormula(formula: string) {
    this._state.calculatorFormula = formula;
  }

  appendToFormula(text: string) {
    this._state.calculatorFormula += text;
  }

  setCalculatorTestResult(result: unknown) {
    this._state.calculatorTestResult = result;
    this._state.calculatorError = null;
  }

  setCalculatorError(error: string | null) {
    this._state.calculatorError = error;
    this._state.calculatorTestResult = null;
  }

  resetCalculator() {
    this._state.calculatorName = '';
    this._state.calculatorFormula = '';
    this._state.calculatorTestResult = null;
    this._state.calculatorError = null;
  }

  resetSearch() {
    this._state.searchQuery = '';
    this._state.searchSource = 'all';
    this._state.replaceValue = '';
  }

  reset() {
    this._state.activeTool = DataToolType.None;
    this.resetSearch();
    this.resetCalculator();
  }
}

export const dataToolsStore = new DataToolsStore();
