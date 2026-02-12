class MapHighlightStore {
  private _highlightedRowIds = $state<Set<number>>(new Set());

  private _version = $state(0);

  get highlightedRowIds(): Set<number> {
    return this._highlightedRowIds;
  }

  get version(): number {
    return this._version;
  }

  get hasHighlights(): boolean {
    return this._highlightedRowIds.size > 0;
  }

  setHighlightedRows(rowIds: number[]): void {
    this._highlightedRowIds = new Set(rowIds);
    this._version++;
  }

  clearHighlights(): void {
    if (this._highlightedRowIds.size === 0) return;
    this._highlightedRowIds = new Set();
    this._version++;
  }

  isRowHighlighted(rowId: number): boolean {
    return this._highlightedRowIds.has(rowId);
  }
}

export const mapHighlightStore = new MapHighlightStore();
