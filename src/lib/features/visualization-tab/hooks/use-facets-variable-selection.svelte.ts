import { facetsStore, type FacetSlotPath } from '../adapters/facets-adapter';
import { NONE_FIELD_ID } from './use-field-selection.svelte';

interface DataFieldOption {
  id: number;
  text: string;
}

interface FacetsVariableSelectionOptions {
  getVisualizationId: () => string | undefined;
  getDataFields: () => DataFieldOption[];
}

export interface FacetMapFill {
  variable: string;
  title: string;
  fieldId: number;
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
  /** One entry per map when the collection lets each map set this fill slot apart. */
  getMapFills(slotPath: FacetSlotPath | undefined): FacetMapFill[];
  selectMapFill(variable: string, fieldId: number): void;
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

  function getMapFills(slotPath: FacetSlotPath | undefined): FacetMapFill[] {
    const visualizationId = getVisualizationId();
    if (
      !slotPath ||
      !visualizationId ||
      !facetsStore.enabled ||
      facetsStore.baseVisualizationId !== visualizationId ||
      facetsStore.fillSlotPath !== slotPath
    ) {
      return [];
    }

    const fields = getDataFields();
    return facetsStore.variables.map((variable) => {
      const column = facetsStore.getFillVariable(variable);
      return {
        variable,
        title: facetsStore.getFacetTitle(variable) ?? variable,
        fieldId:
          fields.find((field) => field.text === column)?.id ?? NONE_FIELD_ID
      };
    });
  }

  function selectMapFill(variable: string, fieldId: number): void {
    const column = getFieldNames([fieldId])[0];
    if (column) {
      void facetsStore.setFillVariable(variable, column);
    }
  }

  return {
    getMapFills,
    getSelectedFieldIds,
    isActiveForSlot,
    selectMapFill,
    toggle,
    updateVariables
  };
}
