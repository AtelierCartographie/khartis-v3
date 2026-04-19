import {
  persistenceRegistry,
  SavePriority,
  type SavePriorityType
} from '$lib/features/project-management/core/persistence-registry';

export type BaseActions<T extends object> = {
  setState: (newState: Partial<T>) => void;
  reset: () => void;
};

export type ToolStoreResult<T extends object, A extends object = object> = {
  state: T;
  actions: BaseActions<T> & A;
  getState: () => T;
};

export interface ToolStorePersistenceConfig<T extends object> {
  key: string;
  priority?: SavePriorityType;
  serializeFilter?: (state: T) => Partial<T>;
}

export function createToolStore<T extends object, A extends object = object>(
  defaultState: T,
  customActions?: (state: T, baseActions: BaseActions<T>) => A,
  persistence?: ToolStorePersistenceConfig<T>
): ToolStoreResult<T, A> {
  const state = $state<T>(structuredClone(defaultState));

  const notifyPersistence = persistence
    ? () =>
        persistenceRegistry.notifyChange(
          persistence.key,
          persistence.priority ?? SavePriority.DEBOUNCED
        )
    : undefined;

  const baseActions: BaseActions<T> = {
    setState: (newState: Partial<T>) => {
      Object.assign(state, newState);
      notifyPersistence?.();
    },
    reset: () => {
      Object.assign(state, structuredClone(defaultState));
      notifyPersistence?.();
    }
  };

  const rawCustom = customActions
    ? customActions(state, baseActions)
    : ({} as A);

  const custom = notifyPersistence
    ? wrapActionsWithNotify(rawCustom, notifyPersistence)
    : rawCustom;

  const serializeState = () =>
    persistence?.serializeFilter
      ? (persistence.serializeFilter(state) as T)
      : state;

  const getState = () => state;

  const result: ToolStoreResult<T, A> = {
    state,
    actions: { ...baseActions, ...custom },
    getState
  };

  if (persistence) {
    persistenceRegistry.register({
      key: persistence.key,
      serialize: () => serializeState(),
      deserialize: (data: unknown) => baseActions.setState(data as Partial<T>),
      reset: () => baseActions.reset(),
      priority: persistence.priority ?? SavePriority.DEBOUNCED
    });
  }

  return result;
}

function wrapActionsWithNotify<A extends object>(
  actions: A,
  notify: () => void
): A {
  const wrapped = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(actions)) {
    if (typeof value === 'function') {
      wrapped[key] = (...args: unknown[]) => {
        const result = (value as (...a: unknown[]) => unknown)(...args);
        if (result instanceof Promise) {
          result.then(
            () => notify(),
            () => notify()
          );
        } else {
          notify();
        }
        return result;
      };
    } else {
      wrapped[key] = value;
    }
  }
  return wrapped as A;
}
