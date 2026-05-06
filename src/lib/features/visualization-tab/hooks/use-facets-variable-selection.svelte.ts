import { facetsStore, type FacetSlotPath } from '../adapters/facets-adapter';

interface DataFieldOption {
  id: number;
  text: string;
}

interface FacetsVariableSelectionOptions {
  getVisualizationId: () => string | undefined;
  getDataFields: () => DataFieldOption[];
}

export function useFacetsVariableSelection({
  getVisualizationId,
  getDataFields
}: FacetsVariableSelectionOptions) {
  const activeSlotPath = $derived.by(() => {
    const visualizationId = getVisualizationId();
    if (
      !facetsStore.enabled ||
      !visualizationId ||
      facetsStore.baseVisualizationId !== visualizationId
    ) {
      return null;
    }

    return facetsStore.primarySlotPath;
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

  async function toggle(
    baseVariableName: string,
    slotPath: FacetSlotPath | undefined,
    enabled: boolean
  ): Promise<void> {
    const visualizationId = getVisualizationId();
    if (!visualizationId || !slotPath) {
      return;
    }

    if (!enabled) {
      facetsStore.disable();
      return;
    }

    const seed = baseVariableName ? [baseVariableName] : [];
    const candidates = seed.slice();

    for (const { text } of getDataFields()) {
      if (candidates.length >= 2) {
        break;
      }
      if (text && !candidates.includes(text)) {
        candidates.push(text);
      }
    }

    if (candidates.length < 2) {
      return;
    }

    await facetsStore.updateVariables(visualizationId, candidates, slotPath);
  }

  return {
    getSelectedFieldIds,
    isActiveForSlot,
    toggle,
    updateVariables
  };
}
