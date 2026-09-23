import { tick } from 'svelte';

export interface UseVirtualScrollProps {
  numRows: number | (() => number);
  maxRows: number | (() => number);
  rowHeight: () => number;
  onLoadMore: () => Promise<void>;
  tableContainer?: HTMLDivElement;
}

export interface UseVirtualScrollReturn {
  rows: number[];
  startIndex: number;
  offsetRows: number;
  handleScroll: () => void;
  goToPosition: (position: number) => Promise<void>;
  initializeRows: (start: number) => Promise<void>;
  setTableContainer: (container: HTMLDivElement | undefined) => void;
  setRows: (newRows: number[]) => void;
}

function createIndexArray(length: number, start = 0): number[] {
  return Array.from({ length }, (_, i) => i + start);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useVirtualScroll(
  props: UseVirtualScrollProps
): UseVirtualScrollReturn {
  let rows = $state<number[]>([]);
  let startIndex = $state<number>(0);
  let tableContainer = $state<HTMLDivElement | undefined>(props.tableContainer);

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
    const safeStart = clamp(start, 0, Math.max(0, numRows - 1));
    const end = numRows - safeStart;
    const length = Math.min(end, maxRows * 2);
    rows = createIndexArray(length, safeStart);
    startIndex = safeStart;
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
      tableContainer.scrollTop = newLength * props.rowHeight();
      props.onLoadMore();
    }
  }

  async function goToPosition(position: number): Promise<void> {
    const numRows = getNumRows();
    if (numRows === 0 || position < 0 || position >= numRows) return;

    const maxWindowSize = Math.max(1, getMaxRows() * 2);
    const maxStartIndex = Math.max(0, numRows - maxWindowSize);
    const newStartIndex = clamp(position - offsetRows, 0, maxStartIndex);

    if (tableContainer) {
      tableContainer.scrollTop = 0;
    }

    await initializeRows(newStartIndex);
    await tick();

    const targetRowPosition = position - newStartIndex;
    const scrollPosition = Math.max(
      0,
      (targetRowPosition - 3) * props.rowHeight()
    );
    if (tableContainer) {
      const maxScrollTop = Math.max(
        0,
        tableContainer.scrollHeight - tableContainer.clientHeight
      );
      tableContainer.scrollTop = Math.min(scrollPosition, maxScrollTop);
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
    goToPosition,
    initializeRows,
    setTableContainer,
    setRows
  };
}
