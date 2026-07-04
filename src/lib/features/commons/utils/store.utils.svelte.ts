import {
  persistenceRegistry,
  SavePriority,
  type SavePriorityType
} from '$lib/features/project-management/core';

export type BaseActions<T extends object> = {
  setState: (newState: Partial<T>) => void;
  reset: () => void;
};

export type ToolStoreResult<T extends object, A extends object = object> = {
  state: T;
  actions: BaseActions<T> & A;
  getState: () => T;
};

export function createReadonlyStateFacade<T extends object>(
  state: T
): Readonly<T> {
  const facade = {} as Record<keyof T, unknown>;

  for (const key of Object.keys(state) as Array<keyof T>) {
    Object.defineProperty(facade, key, {
      enumerable: true,
      get: () => state[key]
    });
  }

  return facade as Readonly<T>;
}

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
  const persistedSetState =
    getSetStateOverride<T>(custom) ?? baseActions.setState;

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
      deserialize: (data: unknown) =>
        persistedSetState(createPersistedState(defaultState, data)),
      reset: () => baseActions.reset(),
      priority: persistence.priority ?? SavePriority.DEBOUNCED
    });
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneStateValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneStateValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneStateValue(entry)])
    );
  }

  return value;
}

function mergeKnownStateShape(
  defaultValue: unknown,
  persistedValue: unknown
): unknown {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(persistedValue)
      ? cloneStateValue(persistedValue)
      : cloneStateValue(defaultValue);
  }

  if (isRecord(defaultValue)) {
    const nextValue = cloneStateValue(defaultValue) as Record<string, unknown>;
    if (!isRecord(persistedValue)) {
      return nextValue;
    }

    for (const key of Object.keys(nextValue)) {
      if (Object.prototype.hasOwnProperty.call(persistedValue, key)) {
        nextValue[key] = mergeKnownStateShape(
          nextValue[key],
          persistedValue[key]
        );
      }
    }

    return nextValue;
  }

  return persistedValue === undefined
    ? cloneStateValue(defaultValue)
    : cloneStateValue(persistedValue);
}

function createPersistedState<T extends object>(
  defaultState: T,
  persistedState: unknown
): Partial<T> {
  return mergeKnownStateShape(defaultState, persistedState) as Partial<T>;
}

function getSetStateOverride<T extends object>(
  actions: object
): ((newState: Partial<T>) => void) | undefined {
  const candidate = (actions as { setState?: unknown }).setState;
  return typeof candidate === 'function'
    ? (candidate as (newState: Partial<T>) => void)
    : undefined;
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
