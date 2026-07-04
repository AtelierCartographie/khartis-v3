import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn(),
  notifyChangeMock: vi.fn()
}));

vi.mock('$lib/features/project-management/core', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: {
    register: mocks.registerMock,
    notifyChange: mocks.notifyChangeMock
  }
}));

import { DataToolType, dataToolsStore } from './data-tools.store.svelte';

describe('dataToolsStore persistence priority', () => {
  beforeEach(() => {
    mocks.notifyChangeMock.mockClear();
    dataToolsStore.reset();
  });

  it('debounces draft updates for search and calculator inputs', () => {
    dataToolsStore.setSearchQuery('population');
    expect(mocks.notifyChangeMock).toHaveBeenLastCalledWith(
      'dataTools',
      'debounced'
    );

    dataToolsStore.setReplaceValue('pop_2024');
    expect(mocks.notifyChangeMock).toHaveBeenLastCalledWith(
      'dataTools',
      'debounced'
    );

    dataToolsStore.setCalculatorFormula('[value] * 2');
    expect(mocks.notifyChangeMock).toHaveBeenLastCalledWith(
      'dataTools',
      'debounced'
    );
  });

  it('flushes immediately for structural tool changes', () => {
    dataToolsStore.openTool(DataToolType.Search);
    expect(mocks.notifyChangeMock).toHaveBeenLastCalledWith(
      'dataTools',
      'immediate'
    );

    dataToolsStore.resetSearch();
    expect(mocks.notifyChangeMock).toHaveBeenLastCalledWith(
      'dataTools',
      'immediate'
    );

    dataToolsStore.closeTool();
    expect(mocks.notifyChangeMock).toHaveBeenLastCalledWith(
      'dataTools',
      'immediate'
    );
  });
});
