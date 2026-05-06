import { describe, it, expect, vi, beforeEach } from 'vitest';

const { visualizationStoreMock } = vi.hoisted(() => ({
  visualizationStoreMock: {
    addDataFilter: vi.fn(),
    removeDataFilter: vi.fn(),
    updateDataFilter: vi.fn()
  }
}));

vi.mock('$lib/features/commons/stores/visualization.store.svelte', () => ({
  visualizationStore: visualizationStoreMock,
  PrimitiveFilterType: {
    POINT: 'point',
    POLYGON: 'polygon',
    LINE: 'line',
    TEXT: 'text'
  }
}));

import { useDataFilters } from './use-data-filters.svelte';

describe('useDataFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handleAddDataFilter delegates to store with primitiveType', () => {
    const viz = { id: 'viz-1' } as never;
    const controller = useDataFilters({
      getSelectedVisualization: () => viz
    });
    controller.handleAddDataFilter(
      { columnName: 'col', operator: '=', value: 'a' } as never,
      'point' as never
    );
    expect(visualizationStoreMock.addDataFilter).toHaveBeenCalledWith('viz-1', {
      columnName: 'col',
      operator: '=',
      value: 'a',
      primitiveType: 'point'
    });
  });

  it('handleAddDataFilter does nothing when no visualization selected', () => {
    const controller = useDataFilters({
      getSelectedVisualization: () => undefined
    });
    controller.handleAddDataFilter({ columnName: 'col' } as never);
    expect(visualizationStoreMock.addDataFilter).not.toHaveBeenCalled();
  });

  it('handleRemoveDataFilter delegates to store', () => {
    const viz = { id: 'viz-1' } as never;
    const controller = useDataFilters({
      getSelectedVisualization: () => viz
    });
    controller.handleRemoveDataFilter('filter-1');
    expect(visualizationStoreMock.removeDataFilter).toHaveBeenCalledWith(
      'viz-1',
      'filter-1'
    );
  });

  it('handleUpdateDataFilter delegates to store', () => {
    const viz = { id: 'viz-1' } as never;
    const controller = useDataFilters({
      getSelectedVisualization: () => viz
    });
    controller.handleUpdateDataFilter('filter-1', { value: 'new' } as never);
    expect(visualizationStoreMock.updateDataFilter).toHaveBeenCalledWith(
      'viz-1',
      'filter-1',
      { value: 'new' }
    );
  });

  it('getFiltersForPrimitive returns only filters matching primitive', () => {
    const viz = {
      id: 'viz-1',
      dataFilters: [
        { id: 'a', primitiveType: 'point' },
        { id: 'b', primitiveType: 'polygon' },
        { id: 'c', primitiveType: 'point' }
      ]
    } as never;
    const controller = useDataFilters({
      getSelectedVisualization: () => viz
    });
    const result = controller.getFiltersForPrimitive('point' as never);
    expect(result.map((f) => f.id)).toEqual(['a', 'c']);
  });

  it('handleClearFilters removes only filters of given primitive', () => {
    const viz = {
      id: 'viz-1',
      dataFilters: [
        { id: 'a', primitiveType: 'point' },
        { id: 'b', primitiveType: 'polygon' },
        { id: 'c', primitiveType: 'point' }
      ]
    } as never;
    const controller = useDataFilters({
      getSelectedVisualization: () => viz
    });
    controller.handleClearFilters('point' as never);
    expect(visualizationStoreMock.removeDataFilter).toHaveBeenCalledTimes(2);
    expect(visualizationStoreMock.removeDataFilter).toHaveBeenCalledWith(
      'viz-1',
      'a'
    );
    expect(visualizationStoreMock.removeDataFilter).toHaveBeenCalledWith(
      'viz-1',
      'c'
    );
  });
});
