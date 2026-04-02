function createMapHighlightStore() {
  let highlightedRowIds = $state<Set<number>>(new Set());
  let version = $state(0);

  function setHighlightedRows(rowIds: number[]): void {
    // Skip version bump if highlight set is identical
    if (
      rowIds.length === highlightedRowIds.size &&
      rowIds.every((id) => highlightedRowIds.has(id))
    ) {
      return;
    }
    highlightedRowIds = new Set(rowIds);
    version++;
  }

  function clearHighlights(): void {
    if (highlightedRowIds.size === 0) return;
    highlightedRowIds = new Set();
    version++;
  }

  function isRowHighlighted(rowId: number): boolean {
    return highlightedRowIds.has(rowId);
  }

  return {
    get highlightedRowIds(): Set<number> {
      return highlightedRowIds;
    },
    get version(): number {
      return version;
    },
    get hasHighlights(): boolean {
      return highlightedRowIds.size > 0;
    },
    setHighlightedRows,
    clearHighlights,
    isRowHighlighted
  };
}

export const mapHighlightStore = createMapHighlightStore();
