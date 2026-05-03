import { describe, expect, it, vi } from 'vitest';
import {
  NONE_FIELD_ID,
  resolveFieldId,
  resolveFieldName,
  useFieldSelection,
  useFieldSelectionHandler,
  type MappingColumnKey
} from './use-field-selection.svelte';

const fields = [
  { id: 1, text: 'population', type: 'number' },
  { id: 2, text: 'region', type: 'text' }
];

describe('use-field-selection', () => {
  it('maps column names to field ids and back', () => {
    expect(resolveFieldId(fields, 'population')).toBe(1);
    expect(resolveFieldId(fields, undefined)).toBe(NONE_FIELD_ID);
    expect(resolveFieldName(fields, 2)).toBe('region');
    expect(resolveFieldName(fields, NONE_FIELD_ID)).toBeUndefined();
  });

  it('keeps a synchronized selected field id and name', () => {
    const selection = useFieldSelection(() => fields);
    expect(selection.selectedFieldId).toBe(NONE_FIELD_ID);
    expect(selection.selectedFieldName).toBeUndefined();

    selection.sync('region');
    expect(selection.selectedFieldId).toBe(2);
    expect(selection.selectedFieldName).toBe('region');

    selection.set(1);
    expect(selection.selectedFieldId).toBe(1);
    expect(selection.selectedFieldName).toBe('population');
  });
});

describe('useFieldSelectionHandler', () => {
  it('should dispatch the selected field name on the configured column key', () => {
    const onMappingChange = vi.fn();
    const handler = useFieldSelectionHandler({
      getDataFields: () => fields,
      columnKey: 'valueColumn' satisfies MappingColumnKey,
      onMappingChange
    });

    handler.handleSelect(2);
    expect(handler.selectedFieldId).toBe(2);
    expect(onMappingChange).toHaveBeenCalledWith({ valueColumn: 'region' });
  });

  it('should dispatch undefined when NONE is selected', () => {
    const onMappingChange = vi.fn();
    const handler = useFieldSelectionHandler({
      getDataFields: () => fields,
      columnKey: 'sizeColumn',
      onMappingChange
    });

    handler.handleSelect(NONE_FIELD_ID);
    expect(handler.selectedFieldId).toBe(NONE_FIELD_ID);
    expect(onMappingChange).toHaveBeenCalledWith({ sizeColumn: undefined });
  });

  it('should call onBeforeChange before onMappingChange', () => {
    const order: string[] = [];
    const handler = useFieldSelectionHandler({
      getDataFields: () => fields,
      columnKey: 'categoryColumn',
      onBeforeChange: () => order.push('before'),
      onMappingChange: () => order.push('mapping')
    });

    handler.handleSelect(1);
    expect(order).toEqual(['before', 'mapping']);
  });
});
