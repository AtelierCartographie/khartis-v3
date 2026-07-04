import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBasemapJoinAttributes } from './use-basemap-join-attributes.svelte';

const mocks = vi.hoisted(() => ({
  getBasemapAttributeValuesMock: vi.fn(),
  getBasemapAttributeAliasesByValueMock: vi.fn()
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getBasemapAttributeValues: (...args: unknown[]) =>
      mocks.getBasemapAttributeValuesMock(...args),
    getBasemapAttributeAliasesByValue: (...args: unknown[]) =>
      mocks.getBasemapAttributeAliasesByValueMock(...args)
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    MAP: 'MAP'
  },
  logger: {
    error: vi.fn()
  }
}));

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useBasemapJoinAttributes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBasemapAttributeValuesMock.mockResolvedValue(['Paris', 'Lyon']);
    mocks.getBasemapAttributeAliasesByValueMock.mockResolvedValue({
      Paris: [{ value: 'PAR', type: 'alias' }]
    });
  });

  it('loads basemap values and aliases for the selected basemap', async () => {
    const basemap = { file: 'france-cities' };
    const hook = useBasemapJoinAttributes({
      getSelectedBasemapId: () => 'france-cities',
      getBasemaps: () => [basemap as never]
    });

    hook.requestValues();
    await flushPromises();

    expect(mocks.getBasemapAttributeValuesMock).toHaveBeenCalledWith(basemap);
    expect(mocks.getBasemapAttributeAliasesByValueMock).toHaveBeenCalledWith(
      basemap
    );
    expect(hook.values).toEqual(['Paris', 'Lyon']);
    expect(hook.aliasesByValue).toEqual({
      Paris: [{ value: 'PAR', type: 'alias' }]
    });
    expect(hook.loading).toBe(false);
  });

  it('does not refetch values already loaded for the active basemap', async () => {
    const basemap = { file: 'france-cities' };
    const hook = useBasemapJoinAttributes({
      getSelectedBasemapId: () => 'france-cities',
      getBasemaps: () => [basemap as never]
    });

    hook.requestValues();
    await flushPromises();
    hook.requestValues();

    expect(mocks.getBasemapAttributeValuesMock).toHaveBeenCalledTimes(1);
  });
});
