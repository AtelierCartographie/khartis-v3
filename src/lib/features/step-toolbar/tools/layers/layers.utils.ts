export function resetDragState<
  T extends { dragIndex: null; dragOverIndex: null }
>(setState: (state: T) => void): void {
  setState({ dragIndex: null, dragOverIndex: null } as T);
}
