import {
  visualizationStore,
  type PrimitiveFilter,
  type VisualizationConfig,
  type VizDataFilter
} from '$lib/features/commons/store/visualization.store.svelte';

export interface UseDataFiltersDeps {
  getSelectedVisualization: () => VisualizationConfig | undefined;
}

export interface DataFiltersController {
  handleAddDataFilter(
    filter: Omit<VizDataFilter, 'id'>,
    primitiveType?: PrimitiveFilter
  ): void;
  handleRemoveDataFilter(filterId: string): void;
  handleUpdateDataFilter(
    filterId: string,
    updates: Partial<Omit<VizDataFilter, 'id'>>
  ): void;
  handleClearFilters(primitive: PrimitiveFilter): void;
  getFiltersForPrimitive(primitive: PrimitiveFilter): VizDataFilter[];
}

export function useDataFilters(
  deps: UseDataFiltersDeps
): DataFiltersController {
  function handleAddDataFilter(
    filter: Omit<VizDataFilter, 'id'>,
    primitiveType?: PrimitiveFilter
  ) {
    const viz = deps.getSelectedVisualization();
    if (!viz?.id) return;
    visualizationStore.addDataFilter(viz.id, { ...filter, primitiveType });
  }

  function handleRemoveDataFilter(filterId: string) {
    const viz = deps.getSelectedVisualization();
    if (!viz?.id) return;
    visualizationStore.removeDataFilter(viz.id, filterId);
  }

  function handleUpdateDataFilter(
    filterId: string,
    updates: Partial<Omit<VizDataFilter, 'id'>>
  ) {
    const viz = deps.getSelectedVisualization();
    if (!viz?.id) return;
    visualizationStore.updateDataFilter(viz.id, filterId, updates);
  }

  function getFiltersForPrimitive(
    primitiveType: PrimitiveFilter
  ): VizDataFilter[] {
    const viz = deps.getSelectedVisualization();
    return (viz?.dataFilters ?? []).filter(
      (filter) => filter.primitiveType === primitiveType
    );
  }

  function handleClearFilters(primitive: PrimitiveFilter): void {
    for (const filter of getFiltersForPrimitive(primitive)) {
      handleRemoveDataFilter(filter.id);
    }
  }

  return {
    handleAddDataFilter,
    handleRemoveDataFilter,
    handleUpdateDataFilter,
    handleClearFilters,
    getFiltersForPrimitive
  };
}
