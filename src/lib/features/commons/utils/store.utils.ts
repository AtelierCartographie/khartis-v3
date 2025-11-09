export function createResetFunction<T extends object>(
  state: T,
  defaultState: T
): () => void {
  return () => Object.assign(state, defaultState);
}
