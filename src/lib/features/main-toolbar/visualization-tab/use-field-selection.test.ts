import { describe, expect, it } from 'vitest';
import {
  NONE_FIELD_ID,
  resolveFieldId,
  resolveFieldName,
  useFieldSelection
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
