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

export type MappingColumnKey =
  | 'valueColumn'
  | 'sizeColumn'
  | 'categoryColumn'
  | 'labelColumn'
  | 'secondaryLabelColumn'
  | 'colorColumn';

export interface UseFieldSelectionHandlerOptions {
  getDataFields: () => FieldSelectionItem[];
  columnKey: MappingColumnKey;
  onMappingChange?: (
    updates: Partial<Record<MappingColumnKey, string | undefined>>
  ) => void;
  onBeforeChange?: (next: string | undefined) => void;
}

export function useFieldSelectionHandler(
  opts: UseFieldSelectionHandlerOptions
) {
  const selection = useFieldSelection(opts.getDataFields);

  function handleSelect(fieldId: number): void {
    selection.set(fieldId);
    const next = resolveFieldName(opts.getDataFields(), fieldId);
    opts.onBeforeChange?.(next);
    opts.onMappingChange?.({ [opts.columnKey]: next });
  }

  return Object.assign(selection, { handleSelect });
}
