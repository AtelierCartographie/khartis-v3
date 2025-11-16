<script lang="ts">
  // eslint-disable svelte/no-unnecessary-state-wrap
  import {
    OverflowMenu,
    OverflowMenuItem,
    Search,
    TextInput,
    Button,
    TextArea
  } from 'carbon-components-svelte';
  import {
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    Close,
    View,
    ViewOff
  } from 'carbon-icons-svelte';
  import { onMount, untrack } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import {
    duckDBOrchestrator,
    RefineOperation,
    type DataTableFilter,
    type FilterOperator,
    type FilterStats,
    type AnalysisResult
  } from '$lib/features/duckdb';
  import type { ProcessedDataset } from '$lib/features/data-pipeline';
  import { logger, LogCategory } from '../utils/logger';
  import {
    create_summary_plot,
    type SummaryPlotData,
    type NumericHistogram,
    type CategoricalHistogram
  } from '$lib/features/duckdb/services/duckdb/summary-plot';
  import SummaryPlot from '$lib/features/duckdb/services/duckdb/SummaryPlot.svelte';
  import ColumnRenameModal from './column-rename-modal.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

  const tableLogger = {
    debug: (message: string, data?: unknown) =>
      logger.debug(message, LogCategory.UI, data),
    info: (message: string, data?: unknown) =>
      logger.info(message, LogCategory.UI, data),
    warn: (message: string, data?: unknown) =>
      logger.warn(message, LogCategory.UI, data),
    error: (message: string, data?: unknown) =>
      logger.error(message, LogCategory.UI, data)
  };

  type HistogramLike = NumericHistogram | CategoricalHistogram;

  function isHistogram(value: unknown): value is HistogramLike {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as HistogramLike).toArray === 'function'
    );
  }

  function isNumericHistogram(value: unknown): value is NumericHistogram {
    if (!isHistogram(value)) return false;
    const sample = value.toArray()[0];
    return sample === undefined || 'bin' in sample;
  }

  function isCategoricalHistogram(
    value: unknown
  ): value is CategoricalHistogram {
    if (!isHistogram(value)) return false;
    const sample = value.toArray()[0];
    return sample === undefined || 'category' in sample;
  }

  interface Props {
    dataset?: ProcessedDataset;
    tableName?: string;
    highlightIds?: number[];
    showSummaryPlots?: boolean;
    maxRows?: number;
  }

  let {
    dataset,
    tableName,
    highlightIds = [],
    showSummaryPlots = true,
    maxRows = 12.5
  }: Props = $props();

  let root: HTMLDivElement;
  let tableContainer = $state<HTMLDivElement | undefined>(undefined);
  let tableElement = $state<HTMLTableElement | undefined>(undefined);
  interface ColumnInfo {
    name: string;
    type: string;
  }

  let columns = $state<ColumnInfo[]>([]);
  let columnAnalysis = $state<SvelteMap<string, AnalysisResult>>(
    new SvelteMap()
  );
  let numRows = $state(0);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  const rowHeight = 32;
  const maxHeight = (maxRows + 1) * rowHeight;
  let startIndex = 0;
  let offsetRows = 1;
  let rows = $state<number[]>([]);
  type TableRow = Record<string, unknown>;
  let tableData = $state<TableRow[]>([]);
  let sortColumn = $state<string | null>(null);
  let sortOrder = $state<'ASC' | 'DESC' | null>(null);
  let hiddenColumns = $state<SvelteSet<string>>(new SvelteSet());
  let renameModalOpen = $state(false);
  let columnToRename = $state<string | null>(null);
  let searchQuery = $state('');
  let replaceValue = $state('');
  let searchResults = $state<number[]>([]);
  let currentSearchIndex = $state(0);
  let filters = $state<DataTableFilter[]>([]);
  let filterStats = $state<FilterStats>({ total: 0, filtered: 0 });
  let newFilter = $state<{
    column: string;
    operator: FilterOperator;
    value: string;
    secondaryValue: string;
    limit: number;
  }>({
    column: '',
    operator: 'equals',
    value: '',
    secondaryValue: '',
    limit: 5
  });
  let selectedRowIds = $state<SvelteSet<number>>(new SvelteSet());
  let selectAllVisible = $state(false);
  let selectedSearchColumns = $state<string[]>([]);
  let showColumnPicker = $state(false);
  let calculator = $state<{
    columnName: string;
    expression: string;
    testing: boolean;
    testResult: unknown;
    error: string | null;
  }>({
    columnName: '',
    expression: '',
    testing: false,
    testResult: null,
    error: null
  });

  const FILTER_OPERATORS: Array<{
    value: FilterOperator;
    label: string;
    requiresValue?: boolean;
    requiresRange?: boolean;
    requiresLimit?: boolean;
  }> = [
    { value: 'gte', label: '≥ Supérieur ou égal', requiresValue: true },
    { value: 'lte', label: '≤ Inférieur ou égal', requiresValue: true },
    { value: 'contains', label: 'Contient', requiresValue: true },
    { value: 'equals', label: 'Égal à', requiresValue: true },
    { value: 'not_equals', label: 'Différent de', requiresValue: true },
    { value: 'between', label: 'Compris entre', requiresRange: true },
    { value: 'top_asc', label: 'Top valeurs ascendantes', requiresLimit: true },
    {
      value: 'top_desc',
      label: 'Top valeurs descendantes',
      requiresLimit: true
    },
    { value: 'empty', label: 'Vide' },
    { value: 'not_empty', label: 'Pas vide' }
  ];

  const COLUMN_TYPE_OPTIONS = [
    { label: 'Texte', value: 'VARCHAR' },
    { label: 'Nombre', value: 'DOUBLE' },
    { label: 'Entier', value: 'BIGINT' },
    { label: 'Date', value: 'DATE' },
    { label: 'Booléen', value: 'BOOLEAN' }
  ];

  const CALCULATOR_TOKENS = [' + ', ' - ', ' * ', ' / ', '(', ')'];

  const currentFilterOperator = $derived.by(
    () =>
      FILTER_OPERATORS.find((op) => op.value === newFilter.operator) ??
      FILTER_OPERATORS[0]
  );

  function recordDatasetTransformation(summary: string) {
    if (!dataset?.id) return;
    datasetsStore.recordTransformation(dataset.id, summary);
  }

  function updateDatasetRowCountLocally(newCount: number) {
    if (!dataset?.id) return;
    datasetsStore.updateDatasetRowCount(dataset.id, newCount);
  }

  function createIndexArray(length: number, start = 0): number[] {
    return Array.from({ length }, (_, i) => i + start);
  }

  async function initializeRows(start: number) {
    const end = numRows - start;
    const length = Math.min(end, maxRows * 2);
    rows = createIndexArray(length, start);
    await loadRowsData();
  }

  async function loadRowsData() {
    if (!tableName && !dataset) return;

    try {
      if (tableName) {
        const data = await duckDBOrchestrator.getTableData(tableName, {
          offset: rows[0],
          limit: rows.length,
          orderBy: sortColumn,
          order: sortOrder
        });

        if (data && data.numRows > 0) {
          tableData = [];
          for (let i = 0; i < data.numRows; i++) {
            tableData.push(data.get(i));
          }
        }
      } else if (dataset) {
        tableData = dataset.data.slice(rows[0], rows[0] + rows.length);
      }
    } catch (err) {
      logger.error('Error loading data', LogCategory.UI, err);
      error = err instanceof Error ? err.message : 'Failed to load data';
    }
  }

  function handleScroll() {
    if (!tableContainer) return;

    const scrollBottom =
      tableContainer.scrollHeight -
      tableContainer.clientHeight -
      tableContainer.scrollTop;

    if (scrollBottom < 1 && rows[rows.length - 1] + 1 < numRows) {
      const endIndex = rows[rows.length - 1] + 1;
      const newEndIndex = Math.min(numRows, endIndex + 13);
      const newLength = newEndIndex - endIndex;
      const moreRows = createIndexArray(newLength, endIndex);
      rows = [...rows, ...moreRows];
      loadRowsData();
    } else if (tableContainer.scrollTop <= 0 && startIndex > 0) {
      const newStartIndex = Math.max(0, startIndex - 13);
      const newLength = startIndex - newStartIndex;
      const newRows = createIndexArray(newLength, newStartIndex);
      rows = [...newRows, ...rows];
      startIndex = newStartIndex;
      tableContainer.scrollTop = startIndex * rowHeight;
      loadRowsData();
    }
  }

  async function sortTable(column: string, order: 'ASC' | 'DESC') {
    if (sortColumn === column && sortOrder === order) {
      sortColumn = null;
      sortOrder = null;
    } else {
      sortColumn = column;
      sortOrder = order;
    }
    startIndex = 0;
    await initializeRows(0);
    if (tableContainer) {
      tableContainer.scrollTop = 0;
    }
  }

  async function goToId(id: number) {
    if (numRows === 0 || id > numRows) return;

    const index = id - 1;
    if (index !== -1) {
      startIndex = Math.max(0, index - offsetRows);
      await initializeRows(startIndex);
      const scrollPosition = offsetRows * rowHeight;
      if (tableContainer) {
        tableContainer.scrollTop = scrollPosition;
      }
    }
  }

  async function renameColumn(oldName: string, newName: string) {
    if (tableName) {
      logger.debug('Renaming column', LogCategory.UI, {
        oldName,
        newName,
        currentSortColumn: sortColumn
      });

      await duckDBOrchestrator.renameColumn(tableName, oldName, newName);

      if (sortColumn === oldName) {
        sortColumn = newName;
        logger.debug('Updated sort column after rename', LogCategory.UI, {
          oldName,
          newName,
          newSortColumn: sortColumn
        });
      }

      if (hiddenColumns.has(oldName)) {
        hiddenColumns.delete(oldName);
        hiddenColumns.add(newName);
        hiddenColumns = hiddenColumns;
        logger.debug('Updated hidden columns after rename', LogCategory.UI, {
          oldName,
          newName
        });
      }

      await loadColumnsInfo();
      await initializeRows(startIndex);

      logger.debug('Rename complete', LogCategory.UI, {
        columns: columns.map((c) => c.name),
        sortColumn,
        sortOrder
      });

      recordDatasetTransformation(`Renommage de ${oldName} en ${newName}`);
    }
  }

  async function dropColumn(columnName: string) {
    if (tableName) {
      await duckDBOrchestrator.dropColumn(tableName, columnName);

      if (sortColumn === columnName) {
        sortColumn = null;
        sortOrder = null;
        logger.debug('Reset sort after column deletion', LogCategory.UI, {
          columnName
        });
      }

      if (hiddenColumns.has(columnName)) {
        hiddenColumns.delete(columnName);
        hiddenColumns = hiddenColumns;
      }

      await loadColumnsInfo();

      recordDatasetTransformation(`Suppression de la colonne ${columnName}`);
    }
  }

  function openRenameModal(columnName: string) {
    columnToRename = columnName;
    renameModalOpen = true;
  }

  async function handleRename(newName: string) {
    if (columnToRename) {
      const oldName = columnToRename;
      logger.debug('handleRename called', LogCategory.UI, {
        oldName,
        newName
      });

      await renameColumn(oldName, newName);

      renameModalOpen = false;
      columnToRename = null;
    }
  }

  function toggleColumnVisibility(columnName: string) {
    logger.debug('Toggle column visibility', LogCategory.UI, {
      columnName,
      wasHidden: hiddenColumns.has(columnName),
      currentHiddenColumns: Array.from(hiddenColumns)
    });

    if (hiddenColumns.has(columnName)) {
      hiddenColumns.delete(columnName);
      logger.debug('Column shown', LogCategory.UI, { columnName });
    } else {
      hiddenColumns.add(columnName);
      logger.debug('Column hidden', LogCategory.UI, { columnName });
    }

    logger.debug('Hidden columns after toggle', LogCategory.UI, {
      hiddenColumns: Array.from(hiddenColumns),
      visibleColumnsCount: visibleColumns.length
    });
  }

  function performSearch() {
    if (!searchQuery.trim()) {
      searchResults = [];
      currentSearchIndex = 0;
      return;
    }

    const query = searchQuery.toLowerCase();
    const results: number[] = [];
    const targetColumns =
      selectedSearchColumns.length > 0
        ? selectedSearchColumns
        : columns.map((c) => c.name);

    tableData.forEach((row, index) => {
      const rowIndex = rows[index];
      const hasMatch = targetColumns.some((columnName) => {
        const value = row[columnName];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(query);
      });
      if (hasMatch) {
        results.push(rowIndex + 1);
      }
    });

    searchResults = results;
    currentSearchIndex = 0;
    if (results.length > 0) {
      goToId(results[0]);
    }
  }

  function goToNextSearchResult() {
    if (searchResults.length === 0) return;
    currentSearchIndex = (currentSearchIndex + 1) % searchResults.length;
    goToId(searchResults[currentSearchIndex]);
  }

  function goToPreviousSearchResult() {
    if (searchResults.length === 0) return;
    currentSearchIndex =
      (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    goToId(searchResults[currentSearchIndex]);
  }

  function clearSearch() {
    searchQuery = '';
    replaceValue = '';
    searchResults = [];
    currentSearchIndex = 0;
  }

  function resetFilterForm() {
    newFilter = {
      column: '',
      operator: 'equals',
      value: '',
      secondaryValue: '',
      limit: 5
    };
  }

  async function refreshFiltersState() {
    if (!tableName) {
      filters = [];
      filterStats = {
        total: dataset?.rowCount ?? 0,
        filtered: dataset?.rowCount ?? 0
      };
      numRows = filterStats.filtered;
      return;
    }

    filters = duckDBOrchestrator.getFilters(tableName);
    filterStats = await duckDBOrchestrator.getRowStats(tableName);
    numRows = filterStats.filtered;
  }

  async function afterFilterChange(transformationLabel?: string) {
    await refreshFiltersState();
    startIndex = 0;
    selectedRowIds = new SvelteSet();
    selectAllVisible = false;
    await initializeRows(0);
    if (transformationLabel) {
      recordDatasetTransformation(transformationLabel);
    }
  }

  async function addFilter(event?: Event) {
    event?.preventDefault();
    if (!tableName || !newFilter.column) return;

    try {
      const updated = await duckDBOrchestrator.addFilter(tableName, {
        column: newFilter.column,
        operator: newFilter.operator,
        value: newFilter.value,
        secondaryValue: newFilter.secondaryValue,
        limit: newFilter.limit
      });
      filters = updated;
      const lastFilter = updated[updated.length - 1];
      await afterFilterChange(
        lastFilter ? `Filtre ajouté: ${lastFilter.label}` : undefined
      );
      resetFilterForm();
    } catch (err) {
      logger.error('Failed to add filter', LogCategory.UI, err);
    }
  }

  async function removeFilter(filterId: string) {
    if (!tableName) return;
    try {
      const updated = await duckDBOrchestrator.removeFilter(
        tableName,
        filterId
      );
      filters = updated;
      await afterFilterChange();
    } catch (err) {
      logger.error('Failed to remove filter', LogCategory.UI, err);
    }
  }

  async function clearAllFilters() {
    if (!tableName || filters.length === 0) return;
    duckDBOrchestrator.clearFilters(tableName);
    filters = [];
    await afterFilterChange('Filtres réinitialisés');
  }

  function getRowInternalId(row: TableRow, fallbackRowIndex: number): number {
    const candidate =
      row?.__id ??
      row?._id ??
      row?.id ??
      row?.__rowid__ ??
      fallbackRowIndex + 1;
    return Number(candidate);
  }

  function isRowSelected(rowId: number): boolean {
    return selectedRowIds.has(rowId);
  }

  function toggleRowSelection(rowId: number, checked: boolean): void {
    const updated = new SvelteSet(selectedRowIds);
    if (checked) {
      updated.add(rowId);
    } else {
      updated.delete(rowId);
    }
    selectedRowIds = updated;
    if (!checked) {
      selectAllVisible = false;
    }
  }

  function toggleSelectAllVisibleRows(): void {
    if (tableData.length === 0) return;
    const updated = new SvelteSet(selectedRowIds);
    const allSelected = tableData.every((row, index) => {
      const rowId = getRowInternalId(row, rows[index]);
      return updated.has(rowId);
    });

    if (allSelected) {
      tableData.forEach((row, index) => {
        const rowId = getRowInternalId(row, rows[index]);
        updated.delete(rowId);
      });
      selectAllVisible = false;
    } else {
      tableData.forEach((row, index) => {
        const rowId = getRowInternalId(row, rows[index]);
        updated.add(rowId);
      });
      selectAllVisible = true;
    }

    selectedRowIds = updated;
  }

  async function deleteSelectedRows() {
    if (!tableName || selectedRowIds.size === 0) return;

    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm(
            `Supprimer ${selectedRowIds.size} ligne(s) du tableau ? Cette action est irréversible.`
          )
        : true;

    if (!confirmed) return;

    const ids = Array.from(selectedRowIds);
    await duckDBOrchestrator.dropRows(tableName, ids);
    selectedRowIds = new SvelteSet();
    selectAllVisible = false;

    await afterFilterChange(`Suppression de ${ids.length} ligne(s)`);
    updateDatasetRowCountLocally(filterStats.total);
  }

  function toggleSearchColumnSelection(columnName: string): void {
    const updated = new SvelteSet(selectedSearchColumns);
    if (updated.has(columnName)) {
      updated.delete(columnName);
    } else {
      updated.add(columnName);
    }
    selectedSearchColumns = Array.from(updated);
  }

  function selectAllSearchColumns(): void {
    selectedSearchColumns = columns.map((c) => c.name);
  }

  function handleFilterLimitInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    const value = Number(target.value || 0);
    newFilter = { ...newFilter, limit: value };
  }

  const createRowCheckboxHandler = (rowId: number) => (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    toggleRowSelection(rowId, target.checked);
  };

  function insertColumnIntoExpression(columnName: string): void {
    calculator = {
      ...calculator,
      expression: `${calculator.expression}"${columnName}"`
    };
  }

  function insertToken(token: string): void {
    calculator = {
      ...calculator,
      expression: `${calculator.expression}${token}`
    };
  }

  async function testCalculatorExpression(): Promise<void> {
    if (!tableName || !calculator.expression.trim()) return;
    calculator = { ...calculator, testing: true, error: null };
    try {
      const result = await duckDBOrchestrator.testExpression(
        tableName,
        calculator.expression
      );
      calculator = { ...calculator, testing: false, testResult: result };
    } catch (err) {
      calculator = {
        ...calculator,
        testing: false,
        error: err instanceof Error ? err.message : 'Expression invalide'
      };
    }
  }

  async function createCalculatedColumn(): Promise<void> {
    if (
      !tableName ||
      !calculator.columnName.trim() ||
      !calculator.expression.trim()
    ) {
      calculator = {
        ...calculator,
        error: 'Nom et formule requis'
      };
      return;
    }

    const columnName = calculator.columnName.trim();

    try {
      await duckDBOrchestrator.addCalculatedColumn(
        tableName,
        columnName,
        calculator.expression
      );
      await loadColumnsInfo();
      await initializeRows(startIndex);
      calculator = {
        columnName: '',
        expression: '',
        testing: false,
        testResult: null,
        error: null
      };
      recordDatasetTransformation(
        `Ajout de la colonne calculée "${columnName}"`
      );
    } catch (err) {
      calculator = {
        ...calculator,
        error: err instanceof Error ? err.message : 'Échec du calcul'
      };
      logger.error('Failed to add calculated column', LogCategory.UI, err);
    }
  }

  async function handleReplace() {
    if (!tableName || !searchQuery || !replaceValue) return;

    const targetColumns =
      selectedSearchColumns.length > 0
        ? selectedSearchColumns
        : columns.map((c) => c.name);

    let total = 0;
    for (const column of targetColumns) {
      const replaced = await duckDBOrchestrator.replaceInColumn(
        tableName,
        column,
        searchQuery,
        replaceValue
      );
      total += replaced;
    }

    if (total > 0) {
      recordDatasetTransformation(
        `Remplacement de "${searchQuery}" par "${replaceValue}" dans ${targetColumns.join(', ')}`
      );
    }

    clearSearch();
    await loadColumnsInfo();
    await initializeRows(startIndex);

    logger.success(`${total} valeurs remplacées`, LogCategory.UI);
  }

  async function handleRefine(columnName: string, operation: RefineOperation) {
    if (!tableName) return;

    logger.debug('Refining column', LogCategory.UI, {
      columnName,
      operation
    });

    await duckDBOrchestrator.refineColumn(tableName, columnName, operation);

    await loadColumnsInfo();
    await initializeRows(startIndex);

    logger.success('Colonne affinée avec succès', LogCategory.UI, {
      columnName,
      operation
    });

    recordDatasetTransformation(`Affinage (${operation}) sur ${columnName}`);
  }

  async function changeColumnType(columnName: string, duckType: string) {
    if (!tableName) return;

    logger.info('Changing column type', LogCategory.UI, {
      columnName,
      duckType
    });

    await duckDBOrchestrator.changeColumnType(tableName, columnName, duckType);
    await loadColumnsInfo();
    await initializeRows(startIndex);

    recordDatasetTransformation(
      `Type de ${columnName} converti en ${duckType}`
    );
  }

  const visibleColumns = $derived.by(() => {
    const hidden = Array.from(hiddenColumns);
    return columns.filter((col) => !hidden.includes(col.name));
  });

  async function loadColumnsInfo() {
    if (tableName) {
      logger.debug('Loading basic column info (fast)', LogCategory.UI, {
        tableName
      });
      const analysis = await duckDBOrchestrator.getBasicColumnInfo(tableName);
      logger.debug('Basic column info loaded', LogCategory.UI, {
        count: analysis.length
      });

      columns = analysis.map((a: AnalysisResult) => ({
        name: a.name,
        type: a.type_simple
      }));
      columns = columns.filter((c) => c.name !== 'geom' && c.name !== '__id');
      const columnNames = columns.map((c) => c.name);
      if (selectedSearchColumns.length === 0) {
        selectedSearchColumns = columnNames;
      } else {
        selectedSearchColumns = selectedSearchColumns.filter((name) =>
          columnNames.includes(name)
        );
      }

      const analysisMap = new SvelteMap<string, AnalysisResult>();
      analysis.forEach((a: AnalysisResult) => {
        if (a.name !== 'geom' && a.name !== '__id') {
          analysisMap.set(a.name, a);
        }
      });
      columnAnalysis = analysisMap;
      logger.debug('Column analysis map created', LogCategory.UI, {
        size: columnAnalysis.size
      });

      if (sortColumn && !columns.some((c) => c.name === sortColumn)) {
        logger.debug('Reset sort - column not found', LogCategory.UI, {
          sortColumn,
          availableColumns: columns.map((c) => c.name)
        });
        sortColumn = null;
        sortOrder = null;
      }
    } else if (dataset) {
      logger.debug(
        'Loading columns from dataset (no analysis)',
        LogCategory.UI
      );
      columns = dataset.columns.filter((c) => c.name !== 'geometry');
      const columnNames = columns.map((c) => c.name);
      if (selectedSearchColumns.length === 0) {
        selectedSearchColumns = columnNames;
      } else {
        selectedSearchColumns = selectedSearchColumns.filter((name) =>
          columnNames.includes(name)
        );
      }

      if (sortColumn && !columns.some((c) => c.name === sortColumn)) {
        logger.debug(
          'Reset sort - column not found in dataset',
          LogCategory.UI
        );
        sortColumn = null;
        sortOrder = null;
      }
    }
  }

  function getPlotForColumn(columnName: string) {
    const analysis = columnAnalysis.get(columnName);
    if (!analysis) {
      return null;
    }

    const histogramValue = analysis.histogram;

    const renderPlot = (summaryData: SummaryPlotData) => {
      try {
        const plot = create_summary_plot(summaryData, {
          width: 150,
          height: 48,
          main_color: '#a56eff',
          nulls_color: '#ffd666'
        });
        return plot;
      } catch (err) {
        logger.error('Error creating histogram', LogCategory.UI, err);
        return null;
      }
    };

    if (analysis.type_simple === 'string') {
      if (!isCategoricalHistogram(histogramValue)) {
        return null;
      }
      const summaryData: SummaryPlotData = {
        ...(analysis as SummaryPlotData & { type_simple: 'string' }),
        histogram: histogramValue
      };
      return renderPlot(summaryData);
    }

    if (analysis.type_simple === 'numeric' || analysis.type_simple === 'date') {
      if (!isNumericHistogram(histogramValue)) {
        return null;
      }
      const summaryData: SummaryPlotData = {
        ...(analysis as SummaryPlotData & {
          type_simple: 'numeric' | 'date';
        }),
        histogram: histogramValue
      };
      return renderPlot(summaryData);
    }

    return null;
  }

  onMount(async () => {
    isLoading = true;

    try {
      await loadColumnsInfo();

      if (tableName) {
        await refreshFiltersState();
      } else if (dataset) {
        numRows = dataset.rowCount;
        filterStats = {
          total: dataset.rowCount,
          filtered: dataset.rowCount
        };
      }

      await initializeRows(startIndex);
    } catch (err) {
      logger.error('Error on mount', LogCategory.UI, err);
      error = err instanceof Error ? err.message : 'Failed to initialize table';
    } finally {
      isLoading = false;
    }
  });

  $effect(() => {
    if (highlightIds.length > 0 && numRows > 0) {
      untrack(() => goToId(highlightIds[0]));
    }
  });

  $effect(() => {
    tableLogger.debug('[AdvancedDataTable] $effect TRIGGERED', {
      hasDataset: !!dataset,
      hasTableName: !!tableName,
      datasetId: dataset?.id,
      datasetName: dataset?.name,
      datasetSourceFileId: dataset?.sourceFileId,
      tableName,
      timestamp: new Date().toISOString()
    });

    tableLogger.debug('[AdvancedDataTable] Data source $effect triggered', {
      hasDataset: !!dataset,
      hasTableName: !!tableName,
      datasetId: dataset?.id,
      datasetName: dataset?.name,
      tableName
    });

    selectedRowIds = new SvelteSet();
    selectAllVisible = false;

    if (dataset || tableName) {
      tableLogger.debug('[AdvancedDataTable] Has data source - LOADING', {
        willLoadFromTable: !!tableName,
        willLoadFromDataset: !!dataset && !tableName
      });

      untrack(async () => {
        tableLogger.debug('[AdvancedDataTable] Starting data load...');
        await loadColumnsInfo();

        if (tableName) {
          tableLogger.debug(
            '[AdvancedDataTable] Getting row count from DuckDB table',
            { tableName }
          );
          await refreshFiltersState();
          tableLogger.debug('[AdvancedDataTable] Row count received', {
            numRows
          });
        } else if (dataset) {
          tableLogger.debug('[AdvancedDataTable] Using dataset row count', {
            rowCount: dataset.rowCount
          });
          numRows = dataset.rowCount;
          filterStats = {
            total: dataset.rowCount,
            filtered: dataset.rowCount
          };
        }

        tableLogger.debug(
          '[AdvancedDataTable] Initializing rows with numRows',
          {
            numRows
          }
        );
        await initializeRows(0);
        tableLogger.debug('[AdvancedDataTable] Data load complete');
      });
    } else {
      tableLogger.debug('[AdvancedDataTable] No data source - CLEARING DATA');
      tableLogger.debug('[AdvancedDataTable] No data source - CLEARING DATA', {
        hasDataset: !!dataset,
        hasTableName: !!tableName
      });
      columns = [];
      numRows = 0;
      tableData = [];
      rows = [];
    }
  });
</script>

<div class="advanced-data-table" bind:this={root}>
  {#if numRows > 0}
    <div class="table-header">
      <div class="table-info">
        <span class="data-count">
          {numRows.toLocaleString('fr-FR')} lignes au total
        </span>
        <span class="visible-count">
          {rows.length.toLocaleString('fr-FR')} lignes affichées
        </span>
        {#if tableName}
          <span class="filter-count">
            {filterStats.filtered.toLocaleString('fr-FR')} / {filterStats.total.toLocaleString(
              'fr-FR'
            )} lignes après filtrage
          </span>
        {/if}
      </div>
      <div class="search-bar">
        <Search
          size="sm"
          placeholder="Rechercher dans le tableau..."
          bind:value={searchQuery}
          on:input={performSearch}
          on:clear={clearSearch}
        />
        {#if tableName}
          <Button
            kind="ghost"
            size="small"
            on:click={() => (showColumnPicker = !showColumnPicker)}
          >
            Colonnes ({selectedSearchColumns.length})
          </Button>
        {/if}
        {#if searchResults.length > 0}
          <div class="search-results">
            <span class="result-count">
              {currentSearchIndex + 1} / {searchResults.length}
            </span>
            <button
              class="nav-btn"
              onclick={goToPreviousSearchResult}
              title="Résultat précédent"
              aria-label="Résultat précédent"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              class="nav-btn"
              onclick={goToNextSearchResult}
              title="Résultat suivant"
              aria-label="Résultat suivant"
            >
              <ChevronRight size={16} />
            </button>
            <button
              class="nav-btn"
              onclick={clearSearch}
              title="Effacer la recherche"
              aria-label="Effacer la recherche"
            >
              <Close size={16} />
            </button>
          </div>
        {/if}
        {#if searchQuery && tableName}
          <div class="replace-bar">
            <TextInput
              size="sm"
              placeholder="Remplacer par..."
              bind:value={replaceValue}
              labelText=""
            />
            <Button
              size="small"
              kind="primary"
              disabled={!replaceValue}
              on:click={handleReplace}
            >
              Remplacer tout ({searchResults.length})
            </Button>
          </div>
        {/if}
      </div>
      {#if showColumnPicker && tableName}
        <div class="column-picker">
          <div class="column-picker-header">
            <span>Colonnes ciblées</span>
            <Button size="small" kind="ghost" on:click={selectAllSearchColumns}>
              Tout sélectionner
            </Button>
          </div>
          <div class="column-picker-list">
            {#each columns as column (column.name)}
              <label>
                <input
                  type="checkbox"
                  checked={selectedSearchColumns.includes(column.name)}
                  onchange={() => toggleSearchColumnSelection(column.name)}
                />
                {column.name}
              </label>
            {/each}
          </div>
        </div>
      {/if}
      {#if hiddenColumns.size > 0}
        <div class="hidden-columns-info">
          <ViewOff size={16} />
          <span class="hidden-count">
            {hiddenColumns.size} colonne{hiddenColumns.size > 1 ? 's' : ''}
            masquée{hiddenColumns.size > 1 ? 's' : ''}
          </span>
          {#each Array.from(hiddenColumns) as hiddenCol (hiddenCol)}
            <button
              class="show-column-btn"
              onclick={() => toggleColumnVisibility(hiddenCol)}
              title={`Afficher ${hiddenCol}`}
            >
              <View size={16} />
              {hiddenCol}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if tableName}
    <div class="data-tools">
      <div class="filters-panel">
        <div class="panel-header">
          <div>
            <h4>Filtres ({filters.length})</h4>
            <p>
              {filterStats.filtered.toLocaleString('fr-FR')} / {filterStats.total.toLocaleString(
                'fr-FR'
              )} lignes visibles
            </p>
          </div>
          <div class="panel-actions">
            <Button
              size="small"
              kind="ghost"
              disabled={!filters.length}
              on:click={clearAllFilters}
            >
              Effacer
            </Button>
          </div>
        </div>
        <form class="filter-form" onsubmit={addFilter}>
          <select bind:value={newFilter.column}>
            <option value="" disabled>Colonne</option>
            {#each columns as column (column.name)}
              <option value={column.name}>{column.name}</option>
            {/each}
          </select>
          <select bind:value={newFilter.operator}>
            {#each FILTER_OPERATORS as operator (operator.value)}
              <option value={operator.value}>{operator.label}</option>
            {/each}
          </select>
          {#if currentFilterOperator.requiresRange}
            <TextInput
              size="sm"
              placeholder="Valeur min"
              bind:value={newFilter.value}
              labelText=""
            />
            <TextInput
              size="sm"
              placeholder="Valeur max"
              bind:value={newFilter.secondaryValue}
              labelText=""
            />
          {:else if currentFilterOperator.requiresValue}
            <TextInput
              size="sm"
              placeholder="Valeur"
              bind:value={newFilter.value}
              labelText=""
            />
          {/if}
          {#if currentFilterOperator.requiresLimit}
            <input
              type="number"
              min="1"
              class="filter-limit-input"
              value={newFilter.limit}
              oninput={handleFilterLimitInput}
              placeholder="Nombre"
            />
          {/if}
          <Button kind="primary" size="small" type="submit">Ajouter</Button>
        </form>
        {#if filters.length > 0}
          <ul class="filters-list">
            {#each filters as filter (filter.id)}
              <li>
                <span>{filter.label}</span>
                <button type="button" onclick={() => removeFilter(filter.id)}>
                  ✕
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="selection-panel">
        <div class="panel-header">
          <h4>Sélection de lignes</h4>
        </div>
        <p>{selectedRowIds.size} ligne(s) sélectionnée(s)</p>
        <div class="selection-actions">
          <Button
            kind="danger-tertiary"
            size="small"
            disabled={!selectedRowIds.size}
            on:click={deleteSelectedRows}
          >
            Supprimer
          </Button>
          <Button
            kind="ghost"
            size="small"
            disabled={!selectedRowIds.size}
            on:click={() => {
              selectedRowIds = new SvelteSet();
              selectAllVisible = false;
            }}
          >
            Vider
          </Button>
        </div>
      </div>

      <div class="calculator-panel">
        <div class="panel-header">
          <h4>Calculatrice</h4>
        </div>
        <div class="calculator-form">
          <TextInput
            size="sm"
            placeholder="Nom de la nouvelle colonne"
            bind:value={calculator.columnName}
            labelText=""
          />
          <TextArea
            rows={3}
            placeholder="Ex : &quot;population&quot; / 1000"
            bind:value={calculator.expression}
            labelText=""
          />
          <div class="calculator-buttons">
            <div class="token-group">
              {#each columns as column (column.name)}
                <button
                  type="button"
                  onclick={() => insertColumnIntoExpression(column.name)}
                >
                  {column.name}
                </button>
              {/each}
            </div>
            <div class="token-group">
              {#each CALCULATOR_TOKENS as token (token)}
                <button type="button" onclick={() => insertToken(token)}>
                  {token.trim() || token}
                </button>
              {/each}
            </div>
          </div>
          <div class="calculator-actions">
            <Button
              size="small"
              kind="ghost"
              disabled={calculator.testing}
              on:click={testCalculatorExpression}
            >
              Tester
            </Button>
            <Button
              size="small"
              kind="primary"
              on:click={createCalculatedColumn}
            >
              Ajouter la colonne
            </Button>
          </div>
          {#if calculator.testResult !== null}
            <p class="calculator-result">
              Exemple : {String(calculator.testResult)}
            </p>
          {/if}
          {#if calculator.error}
            <p class="calculator-error">{calculator.error}</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if isLoading}
    <div class="table-loading">
      <div class="loading-placeholder" aria-busy="true" aria-live="polite">
        Chargement des données…
      </div>
    </div>
  {:else if error}
    <div class="error-message">
      <p>Erreur: {error}</p>
    </div>
  {:else if columns.length > 0}
    <div
      class="table-container"
      style="max-height: {maxHeight}px;"
      bind:this={tableContainer}
      onscroll={handleScroll}
    >
      <table bind:this={tableElement}>
        <thead>
          <tr>
            {#if tableName}
              <th class="row-selector">
                <input
                  type="checkbox"
                  aria-label="Sélectionner toutes les lignes visibles"
                  checked={selectAllVisible}
                  onchange={toggleSelectAllVisibleRows}
                />
              </th>
            {/if}
            {#each visibleColumns as column (column.name)}
              {@const analysis = columnAnalysis.get(column.name)}
              <th>
                <div class="col-header">
                  <div class="col-title-row">
                    <span class="col-name">{column.name}</span>
                    <div class="col-actions">
                      <div class="sort-buttons">
                        <button
                          class="sort-btn"
                          class:active-asc={sortColumn === column.name &&
                            sortOrder === 'ASC'}
                          class:active-desc={sortColumn === column.name &&
                            sortOrder === 'DESC'}
                          onclick={() => {
                            if (sortColumn === column.name) {
                              if (sortOrder === 'ASC') {
                                sortTable(column.name, 'DESC');
                              } else if (sortOrder === 'DESC') {
                                sortTable(column.name, 'ASC');
                              }
                            } else {
                              sortTable(column.name, 'ASC');
                            }
                          }}
                          title={sortColumn === column.name
                            ? sortOrder === 'ASC'
                              ? `Tri croissant sur ${column.name} - Cliquer pour tri décroissant`
                              : `Tri décroissant sur ${column.name} - Cliquer pour tri croissant`
                            : `Trier ${column.name}`}
                          aria-label={sortColumn === column.name
                            ? `Colonne ${column.name} triée par ordre ${sortOrder === 'ASC' ? 'croissant' : 'décroissant'}`
                            : `Trier la colonne ${column.name}`}
                        >
                          <ChevronUp size={16} />
                        </button>
                      </div>
                      {#if tableName}
                        <OverflowMenu size="sm" light>
                          <OverflowMenuItem
                            text="Renommer"
                            on:click={() => openRenameModal(column.name)}
                          />
                          <OverflowMenuItem
                            text="Changer le type..."
                            hasDivider
                          />
                          {#each COLUMN_TYPE_OPTIONS as typeOption (typeOption.value)}
                            <OverflowMenuItem
                              text={`  → ${typeOption.label}`}
                              on:click={() =>
                                changeColumnType(column.name, typeOption.value)}
                            />
                          {/each}
                          <OverflowMenuItem text="Affiner..." hasDivider />
                          <OverflowMenuItem
                            text="  → MAJUSCULES"
                            on:click={() =>
                              handleRefine(
                                column.name,
                                RefineOperation.UPPERCASE
                              )}
                          />
                          <OverflowMenuItem
                            text="  → minuscules"
                            on:click={() =>
                              handleRefine(
                                column.name,
                                RefineOperation.LOWERCASE
                              )}
                          />
                          <OverflowMenuItem
                            text="  → Casse Titre"
                            on:click={() =>
                              handleRefine(
                                column.name,
                                RefineOperation.TITLECASE
                              )}
                          />
                          <OverflowMenuItem
                            text="  → Supprimer espaces"
                            on:click={() =>
                              handleRefine(column.name, RefineOperation.TRIM)}
                          />
                          <OverflowMenuItem
                            text="  → Espaces multiples"
                            on:click={() =>
                              handleRefine(
                                column.name,
                                RefineOperation.TRIM_ALL
                              )}
                          />
                          <OverflowMenuItem
                            text={hiddenColumns.has(column.name)
                              ? 'Afficher'
                              : 'Masquer'}
                            hasDivider
                            on:click={() => toggleColumnVisibility(column.name)}
                          />
                          <OverflowMenuItem
                            text="Supprimer"
                            danger
                            on:click={() => dropColumn(column.name)}
                          />
                        </OverflowMenu>
                      {/if}
                    </div>
                  </div>
                  {#if showSummaryPlots && analysis}
                    {@const plotElement = getPlotForColumn(column.name)}
                    <div class="summary-plot">
                      {#if analysis.type_simple === 'numeric' || analysis.type_simple === 'date'}
                        {#if plotElement}
                          <div class="plot-container">
                            <SummaryPlot svgElement={plotElement} />
                          </div>
                        {/if}
                      {:else if analysis.type_simple === 'string'}
                        <div class="categorical-info">
                          <span class="unique-count"
                            >{analysis.uniques ?? 0} valeurs uniques</span
                          >
                        </div>
                        {#if plotElement}
                          <div class="plot-container">
                            <SummaryPlot svgElement={plotElement} />
                          </div>
                        {/if}
                      {/if}
                    </div>
                  {/if}
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if tableData.length === 0}
            {#each rows as _row, idx (idx)}
              <tr>
                {#if tableName}
                  <td class="row-selector">
                    <div class="skeleton-cell"></div>
                  </td>
                {/if}
                {#each visibleColumns as _col, colIdx (colIdx)}
                  <td><div class="skeleton-cell"></div></td>
                {/each}
              </tr>
            {/each}
          {:else}
            {#each tableData as row, i (rows[i])}
              {@const rowDisplayId = rows[i] + 1}
              {@const internalId = getRowInternalId(row, rows[i])}
              <tr
                class:highlight={highlightIds.includes(rowDisplayId)}
                class:search-highlight={searchResults.includes(rowDisplayId)}
                class:search-active={searchResults.length > 0 &&
                  searchResults[currentSearchIndex] === rowDisplayId}
              >
                {#if tableName}
                  <td class="row-selector">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner la ligne ${rowDisplayId}`}
                      checked={isRowSelected(internalId)}
                      onchange={createRowCheckboxHandler(internalId)}
                    />
                  </td>
                {/if}
                {#each visibleColumns as col (col.name)}
                  {@const value = row[col.name]}
                  {@const isNumeric =
                    col.type === 'number' ||
                    col.type === 'integer' ||
                    col.type === 'bigint'}
                  {@const isDate = col.type === 'date'}
                  <td class:numeric={isNumeric}>
                    {#if value === null || value === undefined}
                      <span class="null-value">—</span>
                    {:else if isDate && value instanceof Date}
                      {value.toLocaleDateString('fr-FR')}
                    {:else if isNumeric}
                      {Number(value).toLocaleString('fr-FR')}
                    {:else}
                      {String(value)}
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="empty-state">
      <p>Aucune donnée disponible</p>
    </div>
  {/if}
</div>

{#if columnToRename}
  <ColumnRenameModal
    bind:open={renameModalOpen}
    columnName={columnToRename}
    onClose={() => {
      renameModalOpen = false;
      columnToRename = null;
    }}
    onRename={handleRename}
  />
{/if}

<style>
  .advanced-data-table {
    background-color: var(--cds-ui-background);
    padding: var(--cds-spacing-05);
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .table-header {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03) 0;
    margin-bottom: var(--cds-spacing-03);
  }

  .table-loading {
    padding: var(--cds-spacing-05);
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .loading-placeholder {
    width: 100%;
    max-width: 320px;
    padding: var(--cds-spacing-05);
    background: var(--cds-layer-01);
    border-radius: var(--cds-spacing-02);
    box-shadow: inset 0 0 0 1px var(--cds-border-subtle);
    text-align: center;
    color: var(--cds-text-02);
  }

  .table-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cds-spacing-03);
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }

  .data-count {
    font-weight: 600;
  }

  .filter-count {
    font-size: 0.85rem;
    color: var(--cds-text-02);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    flex-wrap: wrap;
  }

  .search-bar :global(.bx--search) {
    flex: 1;
    min-width: 240px;
    max-width: 420px;
  }

  .search-results {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    background-color: var(--cds-ui-02);
    border-radius: 4px;
  }

  .column-picker {
    margin-top: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
    background: var(--cds-layer-01);
  }

  .column-picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--cds-spacing-02);
  }

  .column-picker-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-03);
  }

  .column-picker-list label {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-01);
    font-size: 0.85rem;
  }

  .result-count {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 600;
    min-width: 60px;
    text-align: center;
  }

  .nav-btn {
    border: none;
    background: none;
    padding: 4px;
    color: var(--cds-icon-02);
    cursor: pointer;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
  }

  .nav-btn:hover {
    background-color: var(--cds-hover-ui);
    color: var(--cds-icon-01);
  }

  .nav-btn:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
  }

  .data-tools {
    display: flex;
    gap: var(--cds-spacing-04);
    flex-wrap: wrap;
    margin: var(--cds-spacing-04) 0;
  }

  .filters-panel,
  .selection-panel,
  .calculator-panel {
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
    padding: var(--cds-spacing-04);
    background: var(--cds-layer-01);
  }

  .filters-panel {
    flex: 2;
    min-width: 280px;
  }

  .selection-panel {
    flex: 1;
    min-width: 220px;
  }

  .calculator-panel {
    flex: 2;
    min-width: 320px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--cds-spacing-03);
  }

  .panel-header h4 {
    margin: 0;
    font-size: 1rem;
  }

  .panel-header p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--cds-text-02);
  }

  .filter-form {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-02);
    align-items: center;
  }

  .filter-form select,
  .filter-form input[type='number'] {
    padding: var(--cds-spacing-02);
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-spacing-01);
    min-width: 130px;
  }

  .filter-limit-input {
    width: 90px;
  }

  .filters-list {
    margin: var(--cds-spacing-03) 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .filters-list li {
    display: flex;
    justify-content: space-between;
    gap: var(--cds-spacing-02);
    font-size: 0.85rem;
  }

  .filters-list button {
    border: none;
    background: none;
    cursor: pointer;
    color: var(--cds-link-primary);
  }

  .selection-actions {
    display: flex;
    gap: var(--cds-spacing-02);
    flex-wrap: wrap;
  }

  .calculator-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    margin-top: var(--cds-spacing-03);
  }

  .token-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-02);
  }

  .token-group button {
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-spacing-01);
    padding: 2px 6px;
    font-size: 0.75rem;
    background: var(--cds-layer-02);
    cursor: pointer;
  }

  .calculator-actions {
    display: flex;
    gap: var(--cds-spacing-02);
    margin-top: var(--cds-spacing-03);
  }

  .calculator-result {
    margin-top: var(--cds-spacing-02);
    font-size: 0.85rem;
    color: var(--cds-text-02);
  }

  .calculator-error {
    margin-top: var(--cds-spacing-02);
    color: var(--cds-support-01);
    font-size: 0.85rem;
  }

  .hidden-columns-info {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
    background-color: var(--cds-ui-03);
    border-radius: 4px;
    flex-wrap: wrap;
  }

  .hidden-columns-info :global(svg) {
    color: var(--cds-icon-02);
  }

  .hidden-count {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 600;
  }

  .show-column-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-04);
    border-radius: 4px;
    color: var(--cds-text-01);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .show-column-btn:hover {
    background-color: var(--cds-hover-ui);
    border-color: var(--cds-interactive-01);
  }

  .show-column-btn :global(svg) {
    color: var(--cds-icon-01);
  }

  .show-column-btn:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
  }

  .table-container {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: auto;
    background-color: var(--cds-ui-01);
    border: 1px solid var(--cds-ui-03);
    border-radius: 4px;
    position: relative;
  }

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: var(--cds-ui-02);
  }

  thead th {
    text-align: left;
    vertical-align: top;
    padding: var(--cds-spacing-03);
    border-bottom: 2px solid var(--cds-ui-03);
    min-width: 150px;
  }

  th.row-selector,
  td.row-selector {
    width: 42px;
    text-align: center;
  }

  th.row-selector input,
  td.row-selector input {
    cursor: pointer;
  }

  .col-header {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .col-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-02);
  }

  .col-name {
    font-weight: 600;
    color: var(--cds-text-01);
    font-size: 0.875rem;
    flex: 1;
  }

  .col-actions {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .sort-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sort-btn {
    border: none;
    background: none;
    padding: 4px;
    color: var(--cds-icon-02);
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    position: relative;
  }

  .sort-btn :global(svg) {
    transition: transform 0.2s ease-in-out;
  }

  .sort-btn:hover {
    background-color: var(--cds-hover-ui);
    color: var(--cds-icon-01);
  }

  .sort-btn.active-asc {
    background-color: var(--cds-interactive-01);
    color: var(--cds-text-04);
  }

  .sort-btn.active-asc :global(svg) {
    transform: rotate(0deg);
  }

  .sort-btn.active-desc {
    background-color: var(--cds-interactive-01);
    color: var(--cds-text-04);
  }

  .sort-btn.active-desc :global(svg) {
    transform: rotate(180deg);
  }

  .sort-btn.active-asc:hover,
  .sort-btn.active-desc:hover {
    background-color: var(--cds-hover-primary);
  }

  .sort-btn:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
  }

  .summary-plot {
    margin-top: var(--cds-spacing-03);
    min-height: 48px;
  }

  .plot-container {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .plot-container :global(svg) {
    max-width: 100%;
    height: auto;
  }

  .categorical-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-02) 0;
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .unique-count {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  tbody tr {
    border-bottom: 1px solid var(--cds-ui-03);
    transition: background-color 0.15s;
  }

  tbody tr:hover {
    background-color: var(--cds-hover-ui);
  }

  tbody tr.highlight {
    background-color: var(--cds-support-03);
  }

  tbody tr.search-highlight {
    background-color: var(--cds-highlight);
  }

  tbody tr.search-active {
    background-color: var(--cds-interactive-02);
    outline: 2px solid var(--cds-interactive-01);
    outline-offset: -2px;
  }

  tbody td {
    padding: var(--cds-spacing-02) var(--cds-spacing-03);
    color: var(--cds-text-01);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  td.numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .null-value {
    color: var(--cds-text-03);
    font-style: italic;
  }

  .skeleton-cell {
    height: 20px;
    background: linear-gradient(
      100deg,
      var(--cds-ui-03) 40%,
      var(--cds-ui-02) 50%,
      var(--cds-ui-03) 60%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 3px;
  }

  @keyframes shimmer {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: -100% 0;
    }
  }

  .empty-state,
  .error-message {
    padding: var(--cds-spacing-07);
    text-align: center;
    color: var(--cds-text-02);
    background-color: var(--cds-ui-01);
    border-radius: 4px;
  }

  .error-message {
    color: var(--cds-text-error);
    border: 1px solid var(--cds-support-01);
  }
</style>
