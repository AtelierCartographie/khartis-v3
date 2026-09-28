import { facetsStore, type FacetSlotPath } from '../adapters/facets-adapter';

interface DataFieldOption {
  id: number;
  text: string;
}

interface FacetsVariableSelectionOptions {
  getVisualizationId: () => string | undefined;
  getDataFields: () => DataFieldOption[];
}

export interface FacetsVariableSelection {
  getSelectedFieldIds(slotPath: FacetSlotPath | undefined): number[];
  isActiveForSlot(slotPath: FacetSlotPath | undefined): boolean;
  updateVariables(
    baseVariableName: string,
    slotPath: FacetSlotPath | undefined,
    fieldIds: number[]
  ): Promise<void>;
  toggle(slotPath: FacetSlotPath | undefined, enabled: boolean): void;
}

export function useFacetsVariableSelection({
  getVisualizationId,
  getDataFields
}: FacetsVariableSelectionOptions): FacetsVariableSelection {
  const activeSlotPath = $derived.by(() => {
    const visualizationId = getVisualizationId();
    if (!visualizationId) {
      return null;
    }
    if (
      (facetsStore.enabled || facetsStore.suspended) &&
      facetsStore.baseVisualizationId === visualizationId
    ) {
      return facetsStore.primarySlotPath;
    }
    const draft = facetsStore.draft;
    return draft?.baseVisualizationId === visualizationId
      ? draft.slotPath
      : null;
  });

  function isActiveForSlot(slotPath: FacetSlotPath | undefined): boolean {
    return Boolean(slotPath && activeSlotPath === slotPath);
  }

  function getSelectedFieldIds(slotPath: FacetSlotPath | undefined): number[] {
    if (!isActiveForSlot(slotPath)) {
      return [];
    }

    return facetsStore.variables
      .map((name) => getDataFields().find((field) => field.text === name)?.id)
      .filter((id): id is number => typeof id === 'number');
  }

  function getFieldNames(fieldIds: number[]): string[] {
    const fields = getDataFields();
    return fieldIds
      .map((id) => fields.find((field) => field.id === id)?.text)
      .filter((name): name is string => Boolean(name));
  }

  async function updateVariables(
    baseVariableName: string,
    slotPath: FacetSlotPath | undefined,
    fieldIds: number[]
  ): Promise<void> {
    const visualizationId = getVisualizationId();
    if (!visualizationId || !slotPath) {
      return;
    }

    const variableNames = getFieldNames(fieldIds);
    const merged =
      baseVariableName && !variableNames.includes(baseVariableName)
        ? [baseVariableName, ...variableNames]
        : variableNames;

    await facetsStore.updateVariables(visualizationId, merged, slotPath);
  }

  function toggle(slotPath: FacetSlotPath | undefined, enabled: boolean): void {
    const visualizationId = getVisualizationId();
    if (!visualizationId || !slotPath) {
      return;
    }

    if (enabled) {
      facetsStore.startDraft(visualizationId, slotPath);
    } else {
      facetsStore.disable();
    }
  }

  return {
    getSelectedFieldIds,
    isActiveForSlot,
    toggle,
    updateVariables
  };
}
