import { SvelteSet } from 'svelte/reactivity';

export interface UseRowSelectionProps {
  onSelectionChange?: (selectedIds: number[], count: number) => void;
}

export interface UseRowSelectionReturn {
  selectedRowIds: SvelteSet<number>;
  hasSelection: boolean;
  selectionCount: number;
  toggleRowSelection: (rowId: number) => void;
  selectRows: (rowIds: number[]) => void;
  deselectRows: (rowIds: number[]) => void;
  toggleAllRows: (rowIds: number[]) => void;
  clearSelection: () => void;
  isRowSelected: (rowId: number) => boolean;
  areAllSelected: (rowIds: number[]) => boolean;
}

export function useRowSelection(
  props?: UseRowSelectionProps
): UseRowSelectionReturn {
  const selectedRowIds = new SvelteSet<number>();

  const hasSelection = $derived(selectedRowIds.size > 0);
  const selectionCount = $derived(selectedRowIds.size);

  function notifyChange(): void {
    props?.onSelectionChange?.(Array.from(selectedRowIds), selectedRowIds.size);
  }

  function toggleRowSelection(rowId: number): void {
    if (selectedRowIds.has(rowId)) {
      selectedRowIds.delete(rowId);
    } else {
      selectedRowIds.add(rowId);
    }
    notifyChange();
  }

  function selectRows(rowIds: number[]): void {
    for (const id of rowIds) {
      selectedRowIds.add(id);
    }
    notifyChange();
  }

  function deselectRows(rowIds: number[]): void {
    for (const id of rowIds) {
      selectedRowIds.delete(id);
    }
    notifyChange();
  }

  function toggleAllRows(rowIds: number[]): void {
    const allSelected = rowIds.every((id) => selectedRowIds.has(id));
    if (allSelected) {
      deselectRows(rowIds);
    } else {
      selectRows(rowIds);
    }
  }

  function clearSelection(): void {
    selectedRowIds.clear();
    notifyChange();
  }

  function isRowSelected(rowId: number): boolean {
    return selectedRowIds.has(rowId);
  }

  function areAllSelected(rowIds: number[]): boolean {
    if (rowIds.length === 0) return false;
    return rowIds.every((id) => selectedRowIds.has(id));
  }

  return {
    get selectedRowIds() {
      return selectedRowIds;
    },
    get hasSelection() {
      return hasSelection;
    },
    get selectionCount() {
      return selectionCount;
    },
    toggleRowSelection,
    selectRows,
    deselectRows,
    toggleAllRows,
    clearSelection,
    isRowSelected,
    areAllSelected
  };
}
