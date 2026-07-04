import { afterEach, describe, expect, it, vi } from 'vitest';
import { createToolStore } from './store.utils.svelte';
import { persistenceRegistry } from '$lib/features/project-management/core';

const TEST_KEYS = [
  'testToolStore',
  'testToolStoreWithCustomSetState',
  'testToolStoreInvalidPayload',
  'testToolStoreProxyPayload'
];

afterEach(() => {
  for (const key of TEST_KEYS) {
    persistenceRegistry.unregister(key);
  }
  persistenceRegistry.markClean();
});

describe('createToolStore persistence', () => {
  it('merges persisted data into defaults without copying unknown keys', () => {
    const store = createToolStore(
      {
        enabled: false,
        nested: {
          value: 1,
          kept: 'default'
        },
        items: ['default']
      },
      undefined,
      { key: 'testToolStore' }
    );

    persistenceRegistry.deserializeAll({
      testToolStore: {
        enabled: true,
        nested: {
          value: 2,
          unexpected: 'ignored'
        },
        unknownRoot: true
      }
    });

    expect(store.state.enabled).toBe(true);
    expect(store.state.nested).toEqual({
      value: 2,
      kept: 'default'
    });
    expect(store.state.items).toEqual(['default']);
    expect(
      Object.prototype.hasOwnProperty.call(store.state, 'unknownRoot')
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(store.state.nested, 'unexpected')
    ).toBe(false);
  });

  it('routes deserialize through a custom setState action when present', () => {
    const customSetState = vi.fn(
      (
        state: { count: number },
        newState: Partial<{ count: number }>
      ): void => {
        state.count = Math.min(newState.count ?? state.count, 10);
      }
    );
    const store = createToolStore(
      { count: 0 },
      (state) => ({
        setState: (newState: Partial<{ count: number }>) =>
          customSetState(state, newState)
      }),
      { key: 'testToolStoreWithCustomSetState' }
    );

    persistenceRegistry.deserializeAll({
      testToolStoreWithCustomSetState: {
        count: 99
      }
    });

    expect(customSetState).toHaveBeenCalledOnce();
    expect(store.state.count).toBe(10);
  });

  it('restores defaults when persisted data is not an object', () => {
    const store = createToolStore(
      { enabled: false, label: 'default' },
      undefined,
      { key: 'testToolStoreInvalidPayload' }
    );

    store.actions.setState({ enabled: true, label: 'changed' });
    persistenceRegistry.deserializeAll({
      testToolStoreInvalidPayload: null
    });

    expect(store.state.enabled).toBe(false);
    expect(store.state.label).toBe('default');
  });

  it('accepts persisted data coming from Svelte proxied state', () => {
    const store = createToolStore(
      { items: [] as Array<{ id: string }> },
      undefined,
      { key: 'testToolStoreProxyPayload' }
    );
    const persistedState = $state({
      items: [{ id: 'restored' }]
    });

    persistenceRegistry.deserializeAll({
      testToolStoreProxyPayload: persistedState
    });

    expect(store.state.items).toEqual([{ id: 'restored' }]);
  });
});
