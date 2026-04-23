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
});
