import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-facets-variable-selection.svelte.ts'),
  'utf8'
);

describe('useFacetsVariableSelection', () => {
  it('centralizes facets variable selection and toggle behavior', () => {
    expect(source).toContain('export function useFacetsVariableSelection');
    expect(source).toContain('getSelectedFieldIds');
    expect(source).toContain('updateVariables');
    expect(source).toContain('toggle');
  });

  it('preserves the active base variable when updating a collection', () => {
    expect(source).toContain(
      'baseVariableName && !variableNames.includes(baseVariableName)'
    );
    expect(source).toContain('[baseVariableName, ...variableNames]');
  });

  it('does not seed collection facets with technical identifiers', () => {
    expect(source).toContain('isFieldCompatibleWithSlot(field, slotPath)');
    expect(source).toContain('facetSlotRequiresNumericVariable(slotPath)');
    expect(source).toContain('isAutoFacetNumericColumn(field)');
  });

  it('can seed collection facets from the picker visible field list', () => {
    expect(source).toContain('seedFieldIds?: number[]');
    expect(source).toContain('const seedFieldNames = seedFieldIds');
    expect(source).toContain('getFieldNames(seedFieldIds)');
    expect(source).toContain('seedFieldNames.length >= 2');
  });
});
