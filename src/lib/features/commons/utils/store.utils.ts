export function createResetFunction<T extends Record<string, any>>(
  state: T,
  defaultState: T
): () => void {
  return () => Object.assign(state, defaultState);
}
