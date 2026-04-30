import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection-main.svelte'),
  'utf8'
);

describe('ProjectionMain', () => {
  it('lets a selected projection card clear the user projection override', () => {
    expect(source).toContain("projectionState.overrideSource !== 'manual'");
    expect(source).toContain('projectionState.activeSuggestionId');
    expect(source).toContain('projectionActions.toggleSelected(projectionId);');
  });

  it('binds suggestion card selection to the active suggestion id', () => {
    expect(source).toContain(
      'function isSuggestionSelected(suggestion: ProjectionSuggestion)'
    );
    expect(source).toContain(
      'projectionState.activeSuggestionId === suggestion.id'
    );
    expect(source).toContain('selected={isSuggestionSelected(s)}');
  });

  it('renders expanded mode as a three-column css grid', () => {
    expect(source).toContain('const gridProjections = $derived(');
    expect(source).toContain('GROUPS.flatMap((group) =>');
    expect(source).toContain("{#each gridProjections as p (p.id + '-grid')}");
    expect(source).toContain(
      'grid-template-columns: repeat(3, minmax(0, 1fr));'
    );
    expect(source).toContain('grid-auto-rows: 19rem;');
    expect(source).toContain('align-items: stretch;');
    expect(source).toContain('.projection-grid :global(.projection-card) {');
  });
});
