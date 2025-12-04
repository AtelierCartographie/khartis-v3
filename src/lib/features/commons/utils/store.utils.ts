/**
 * Crée une fonction reset pour un store Svelte 5
 * @param state L'objet state du store
 * @param defaultState L'état par défaut
 * @returns Une fonction qui réinitialise le state
 */
export function createResetFunction<T extends object>(
  state: T,
  defaultState: T
): () => void {
  return () => Object.assign(state, defaultState);
}

export function createSetStateFunction<T extends object>(
  state: T
): (newState: Partial<T>) => void {
  return (newState: Partial<T>) => {
    Object.assign(state, newState);
  };
}
