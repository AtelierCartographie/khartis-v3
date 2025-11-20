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

/**
 * Crée une fonction setState pour un store Svelte 5
 * Évite la duplication de code dans tous les stores
 * @param state L'objet state du store
 * @returns Une fonction qui met à jour partiellement le state
 */
export function createSetStateFunction<T extends object>(
  state: T
): (newState: Partial<T>) => void {
  return (newState: Partial<T>) => {
    Object.assign(state, newState);
  };
}

/**
 * Crée un objet d'actions de base pour un store Svelte 5
 * Inclut setState et reset
 * @param state L'objet state du store
 * @param defaultState L'état par défaut
 * @returns Un objet avec les actions setState et reset
 */
export function createStoreActions<T extends object>(
  state: T,
  defaultState: T
): {
  setState: (newState: Partial<T>) => void;
  reset: () => void;
} {
  return {
    setState: createSetStateFunction(state),
    reset: createResetFunction(state, defaultState)
  };
}
