import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notifyChangeMock, registerMock } = vi.hoisted(() => ({
  notifyChangeMock: vi.fn(),
  registerMock: vi.fn()
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  },
  persistenceRegistry: {
    notifyChange: notifyChangeMock,
    register: registerMock
  }
}));

import {
  dataTabActions,
  dataTabState
} from '$lib/features/commons/store/data-tab.store.svelte';

describe('dataTabActions.clearJoinStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataTabActions.reset();
  });

  it('does not notify persistence when join stats are already empty', () => {
    dataTabActions.clearJoinStats();

    expect(notifyChangeMock).not.toHaveBeenCalled();
  });

  it('clears persisted join stats only when values actually change', () => {
    dataTabActions.setBasemapJoinState({
      joinedEntities: 12,
      entitiesToVerify: 2,
      duplicateEntities: ['A'],
      unrecognizedEntities: ['B'],
      joinMappings: [
        {
          dataValue: 'A',
          basemapOptions: ['Alpha'],
          selectedMapping: 'Alpha'
        }
      ]
    });
    notifyChangeMock.mockClear();

    dataTabActions.clearJoinStats();

    expect(dataTabState.basemapJoin.joinedEntities).toBe(0);
    expect(dataTabState.basemapJoin.entitiesToVerify).toBe(0);
    expect(dataTabState.basemapJoin.duplicateEntities).toEqual([]);
    expect(dataTabState.basemapJoin.unrecognizedEntities).toEqual([]);
    expect(dataTabState.basemapJoin.joinMappings).toEqual([]);
    expect(notifyChangeMock).toHaveBeenCalledOnce();
    expect(notifyChangeMock).toHaveBeenCalledWith('dataTab', 'immediate');
  });
});
