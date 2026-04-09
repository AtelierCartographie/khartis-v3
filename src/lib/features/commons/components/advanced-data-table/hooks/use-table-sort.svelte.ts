export interface UseTableSortProps {
  initialSortColumn?: string | null;
  initialSortOrder?: 'ASC' | 'DESC' | null;
  onSortChange?: (column: string | null, order: 'ASC' | 'DESC' | null) => void;
}

export interface UseTableSortReturn {
  sortColumn: string | null;
  sortOrder: 'ASC' | 'DESC' | null;
  sortTable: (column: string, order: 'ASC' | 'DESC') => void;
  toggleSort: (column: string) => void;
}

export function useTableSort(props?: UseTableSortProps): UseTableSortReturn {
  let sortColumn = $state<string | null>(props?.initialSortColumn ?? null);
  let sortOrder = $state<'ASC' | 'DESC' | null>(
    props?.initialSortOrder ?? null
  );

  function sortTable(column: string, order: 'ASC' | 'DESC'): void {
    sortColumn = column;
    sortOrder = order;
    props?.onSortChange?.(column, order);
  }

  function toggleSort(column: string): void {
    if (sortColumn !== column) {
      sortColumn = column;
      sortOrder = 'ASC';
    } else {
      if (sortOrder === 'ASC') {
        sortOrder = 'DESC';
      } else if (sortOrder === 'DESC') {
        sortColumn = null;
        sortOrder = null;
      } else {
        sortOrder = 'ASC';
      }
    }

    props?.onSortChange?.(sortColumn, sortOrder);
  }

  return {
    get sortColumn() {
      return sortColumn;
    },
    get sortOrder() {
      return sortOrder;
    },
    sortTable,
    toggleSort
  };
}
