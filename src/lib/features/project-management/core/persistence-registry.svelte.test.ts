import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistenceRegistry, SavePriority } from './persistence-registry';

const HMR_TEST_KEY = 'hmrTestStore';

afterEach(() => {
  persistenceRegistry.unregister(HMR_TEST_KEY);
  persistenceRegistry.markClean();
});

describe('PersistenceRegistry', () => {
  it('replaces entries by key when store modules re-register during HMR', () => {
    const oldDeserialize = vi.fn();
    const newDeserialize = vi.fn();

    persistenceRegistry.register({
      key: HMR_TEST_KEY,
      priority: SavePriority.DEBOUNCED,
      serialize: () => 'old',
      deserialize: oldDeserialize,
      reset: vi.fn()
    });
    persistenceRegistry.register({
      key: HMR_TEST_KEY,
      priority: SavePriority.IMMEDIATE,
      serialize: () => 'new',
      deserialize: newDeserialize,
      reset: vi.fn()
    });

    expect(
      persistenceRegistry.registeredKeys.filter((key) => key === HMR_TEST_KEY)
    ).toHaveLength(1);
    expect(persistenceRegistry.serializeAll()[HMR_TEST_KEY]).toBe('new');

    persistenceRegistry.deserializeAll({
      [HMR_TEST_KEY]: 'payload'
    });

    expect(oldDeserialize).not.toHaveBeenCalled();
    expect(newDeserialize).toHaveBeenCalledWith('payload');
  });
});
