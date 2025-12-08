import { tick } from 'svelte';
import { TABLE_ROW_HEIGHT } from '../types';

export interface UseVirtualScrollProps {
  numRows: number | (() => number);
  maxRows: number | (() => number);
  onLoadMore: () => Promise<void>;
  tableContainer?: HTMLDivElement;
}

export interface UseVirtualScrollReturn {
  rows: number[];
  startIndex: number;
  offsetRows: number;
  handleScroll: () => void;
  goToId: (id: number) => Promise<void>;
  initializeRows: (start: number) => Promise<void>;
  setTableContainer: (container: HTMLDivElement | undefined) => void;
  setRows: (newRows: number[]) => void;
}

function createIndexArray(length: number, start = 0): number[] {
  return Array.from({ length }, (_, i) => i + start);
}

export function useVirtualScroll(
  props: UseVirtualScrollProps
): UseVirtualScrollReturn {
  let rows = $state<number[]>([]);
  let startIndex = $state<number>(0);
  let tableContainer = $state<HTMLDivElement | undefined>(props.tableContainer);

  const rowHeight = TABLE_ROW_HEIGHT;
  const offsetRows = 5;
  const scrollIncrement = 13;

  function getNumRows(): number {
    return typeof props.numRows === 'function'
      ? props.numRows()
      : props.numRows;
  }

  function getMaxRows(): number {
    return typeof props.maxRows === 'function'
      ? props.maxRows()
      : props.maxRows;
  }

  async function initializeRows(start: number): Promise<void> {
    const numRows = getNumRows();
    const maxRows = getMaxRows();
    const end = numRows - start;
    const length = Math.min(end, maxRows * 2);
    rows = createIndexArray(length, start);
    startIndex = start;
    await props.onLoadMore();
  }

  function handleScroll(): void {
    if (!tableContainer) return;

    const numRows = getNumRows();
    const scrollBottom =
      tableContainer.scrollHeight -
      tableContainer.clientHeight -
      tableContainer.scrollTop;

    if (scrollBottom < 1 && rows[rows.length - 1] + 1 < numRows) {
      const endIndex = rows[rows.length - 1] + 1;
      const newEndIndex = Math.min(numRows, endIndex + scrollIncrement);
      const newLength = newEndIndex - endIndex;
      const moreRows = createIndexArray(newLength, endIndex);
      rows = [...rows, ...moreRows];
      props.onLoadMore();
    } else if (tableContainer.scrollTop <= 0 && startIndex > 0) {
      const newStartIndex = Math.max(0, startIndex - scrollIncrement);
      const newLength = startIndex - newStartIndex;
      const newRows = createIndexArray(newLength, newStartIndex);
      rows = [...newRows, ...rows];
      startIndex = newStartIndex;
      tableContainer.scrollTop = newLength * rowHeight;
      props.onLoadMore();
    }
  }

  async function goToId(id: number): Promise<void> {
    const numRows = getNumRows();
    if (numRows === 0 || id > numRows) return;

    const index = id - 1;
    if (index !== -1) {
      const newStartIndex = Math.max(0, index - offsetRows);
      await initializeRows(newStartIndex);
      await tick();

      const targetRowPosition = index - newStartIndex;
      const scrollPosition = Math.max(0, (targetRowPosition - 3) * rowHeight);
      if (tableContainer) {
        tableContainer.scrollTop = scrollPosition;
      }
    }
  }

  function setRows(newRows: number[]): void {
    rows = newRows;
  }

  function setTableContainer(container: HTMLDivElement | undefined): void {
    tableContainer = container;
  }

  return {
    get rows() {
      return rows;
    },
    get startIndex() {
      return startIndex;
    },
    get offsetRows() {
      return offsetRows;
    },
    handleScroll,
    goToId,
    initializeRows,
    setTableContainer,
    setRows
  };
}
