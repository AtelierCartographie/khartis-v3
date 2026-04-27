import { describe, expect, it } from 'vitest';
import {
  NONE_FIELD_ID,
  filterFieldsByKind,
  type FieldSelectionItem
} from './use-field-selection.svelte';

const items: FieldSelectionItem[] = [
  { id: NONE_FIELD_ID, text: 'None' },
  { id: 1, text: 'population', type: 'number' },
  { id: 2, text: 'country', type: 'text' },
  { id: 3, text: 'updated_at', type: 'date' },
  { id: 4, text: 'active', type: 'boolean' }
];

describe('filterFieldsByKind', () => {
  it('keeps none first and returns only numeric fields for numeric selectors', () => {
    expect(filterFieldsByKind(items, 'numeric')).toEqual([items[0], items[1]]);
  });

  it('keeps textual-compatible fields for category selectors', () => {
    expect(filterFieldsByKind(items, 'textual')).toEqual([
      items[0],
      items[2],
      items[3],
      items[4]
    ]);
  });

  it('keeps the selected field visible even when its type no longer matches', () => {
    expect(filterFieldsByKind(items, 'numeric', 2)).toEqual([
      items[0],
      items[1],
      items[2]
    ]);
  });
});
