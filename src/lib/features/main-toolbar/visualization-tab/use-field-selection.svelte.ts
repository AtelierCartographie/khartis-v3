export interface FieldSelectionItem {
  id: number;
  text: string;
  type?: string;
}

export const NONE_FIELD_ID = -1;

export function resolveFieldId(
  dataFields: FieldSelectionItem[],
  columnName: string | undefined
): number {
  if (!columnName) {
    return NONE_FIELD_ID;
  }

  const field = dataFields.find((item) => item.text === columnName);
  return field?.id ?? NONE_FIELD_ID;
}

export function resolveFieldName(
  dataFields: FieldSelectionItem[],
  fieldId: number
): string | undefined {
  if (fieldId === NONE_FIELD_ID) {
    return undefined;
  }

  return dataFields.find((item) => item.id === fieldId)?.text;
}

export function useFieldSelection(getDataFields: () => FieldSelectionItem[]) {
  let selectedFieldId = $state<number>(NONE_FIELD_ID);

  function sync(columnName: string | undefined): void {
    selectedFieldId = resolveFieldId(getDataFields(), columnName);
  }

  function set(fieldId: number): void {
    selectedFieldId = fieldId;
  }

  return {
    get selectedFieldId(): number {
      return selectedFieldId;
    },
    get selectedFieldName(): string | undefined {
      return resolveFieldName(getDataFields(), selectedFieldId);
    },
    sync,
    set
  };
}
