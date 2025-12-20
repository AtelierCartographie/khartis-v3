export type BaseActions<T extends object> = {
  setState: (newState: Partial<T>) => void;
  reset: () => void;
};

export type ToolStoreResult<T extends object, A extends object = object> = {
  state: T;
  actions: BaseActions<T> & A;
  getState: () => T;
};

export function createToolStore<T extends object, A extends object = object>(
  defaultState: T,
  customActions?: (state: T, baseActions: BaseActions<T>) => A
): ToolStoreResult<T, A> {
  const state = $state<T>(structuredClone(defaultState));

  const baseActions: BaseActions<T> = {
    setState: (newState: Partial<T>) => Object.assign(state, newState),
    reset: () => Object.assign(state, structuredClone(defaultState))
  };

  const custom = customActions ? customActions(state, baseActions) : ({} as A);

  return {
    state,
    actions: { ...baseActions, ...custom },
    getState: () => state
  };
}
