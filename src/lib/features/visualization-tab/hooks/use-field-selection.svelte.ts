export interface FieldSelectionItem {
  id: number;
  text: string;
  type?: string;
}

export interface FieldSelection {
  selectedFieldId: number;
  selectedFieldName: string | undefined;
}

export interface FieldSelectionWithHandler extends FieldSelection {
  handleSelect: (fieldId: number) => void;
}

export const NONE_FIELD_ID = -1;

export type FieldSelectionKind = 'numeric' | 'textual' | 'any';

function matchesFieldSelectionKind(
  item: FieldSelectionItem,
  kind: FieldSelectionKind
): boolean {
  if (kind === 'any' || item.id === NONE_FIELD_ID) {
    return true;
  }

  if (kind === 'numeric') {
    // Column metadata may use `number` or `numeric`; both must stay selectable.
    return item.type === 'number' || item.type === 'numeric';
  }

  return (
    item.type === 'text' ||
    item.type === 'string' ||
    item.type === 'date' ||
    item.type === 'boolean'
  );
}

export function filterFieldsByKind(
  items: FieldSelectionItem[],
  kind: FieldSelectionKind,
  selectedFieldId?: number
): FieldSelectionItem[] {
  const filtered = items.filter(
    (item) =>
      matchesFieldSelectionKind(item, kind) || item.id === selectedFieldId
  );
  const noneOption = items.find((item) => item.id === NONE_FIELD_ID);

  if (!noneOption) {
    return filtered;
  }

  return [noneOption, ...filtered.filter((item) => item.id !== NONE_FIELD_ID)];
}

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

export type MappingColumnKeyResolver =
  MappingColumnKey | (() => MappingColumnKey);

export interface UseFieldSelectionHandlerOptions {
  getDataFields: () => FieldSelectionItem[];
  columnKey: MappingColumnKeyResolver;
  onMappingChange?: (
    updates: Partial<Record<MappingColumnKey, string | undefined>>
  ) => void;
  onBeforeChange?: (next: string | undefined) => void;
}

function resolveMappingColumnKey(
  columnKey: MappingColumnKeyResolver
): MappingColumnKey {
  return typeof columnKey === 'function' ? columnKey() : columnKey;
}

export function useFieldSelectionHandler(
  opts: UseFieldSelectionHandlerOptions
) {
  const selection = useFieldSelection(opts.getDataFields);

  function handleSelect(fieldId: number): void {
    selection.set(fieldId);
    const next = resolveFieldName(opts.getDataFields(), fieldId);
    opts.onBeforeChange?.(next);
    opts.onMappingChange?.({ [resolveMappingColumnKey(opts.columnKey)]: next });
  }

  return Object.assign(selection, { handleSelect });
}
