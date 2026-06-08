import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'projection-main.svelte'),
  'utf8'
);

describe('ProjectionMain', () => {
  it('lets a selected projection card clear the user projection override', () => {
    expect(source).toContain('projectionState.overrideActive !== true');
    expect(source).toContain('projectionState.activeSuggestionId');
    expect(source).toContain('projectionActions.applySuggestion(suggestion);');
  });

  it('binds suggestion card selection to the active suggestion id', () => {
    expect(source).toContain(
      "import { getCatalogueProjectionIdForSuggestion } from './projection-suggestion-catalogue.utils';"
    );
    expect(source).toContain(
      'function isSuggestionSelected(suggestion: ProjectionSuggestion)'
    );
    expect(source).toContain("projectionState.overrideSource !== 'manual'");
    expect(source).toContain(
      'projectionState.activeSuggestionId === suggestion.id'
    );
    expect(source).toContain('isStoredSuggestionConfigSelected(suggestion)');
    expect(source).toContain(
      'getCatalogueProjectionIdForSuggestion(suggestion)'
    );
    expect(source).toContain('selected={isSuggestionSelected(suggestion)}');
  });

  it('keeps computed suggestions visible after a suggestion projection is active', () => {
    expect(source).toContain(
      'const suggestions = $derived(projectionState.suggestions);'
    );
    expect(source).not.toContain(
      'suggestionCardsEnabled ? projectionState.suggestions : undefined'
    );
  });

  it('recomputes projection suggestions when a persisted project has none loaded', () => {
    expect(source).toContain("import { untrack } from 'svelte';");
    expect(source).toContain(
      'if (!suggestionCardsEnabled || suggestions !== undefined)'
    );
    expect(source).toContain(
      'projectionActions.suggestProjectionForCurrentData()'
    );
  });

  it('paginates suggestion cards locally without recomputing projections', () => {
    expect(source).toContain('const INITIAL_VISIBLE_SUGGESTIONS = 3;');
    expect(source).toContain('let suggestionLimitState = $state({');
    expect(source).toContain('const visibleSuggestionLimit = $derived(');
    expect(source).toContain(
      'filteredListSuggestions.slice(0, visibleSuggestionLimit)'
    );
    expect(source).toContain('function showMoreSuggestions()');
    expect(source).not.toContain(
      'on:click={() => projectionActions.suggestProjectionForCurrentData()}'
    );
  });

  it('resets local pagination only when suggestions or filters change', () => {
    expect(source).toContain('const suggestionResetSignature = $derived(');
    expect(source).toContain(
      'suggestionLimitState.signature === suggestionResetSignature'
    );
    expect(source).toContain(': INITIAL_VISIBLE_SUGGESTIONS');
  });

  it('renders an explicit empty state instead of a blank suggestion area', () => {
    expect(source).toContain('projection-empty-state');
    expect(source).toContain('m.projection_suggestions_empty_title()');
    expect(source).toContain('m.projection_suggestions_unavailable_title()');
  });

  it('renders projection suggestions as a single list without a display mode toggle', () => {
    expect(source).toContain(
      '{#each visibleListSuggestions as suggestion (suggestion.id)}'
    );
    expect(source).not.toContain(
      "import { ViewMode } from '$lib/features/commons/constants/ui.constants';"
    );
    expect(source).not.toContain('GridIcon');
    expect(source).not.toContain('projection-view-tabs');
    expect(source).not.toContain('projection-content--grid');
    expect(source).not.toContain('handleViewModeChange');
  });

  it('stretches compact suggestion cards across the available popover body', () => {
    expect(source).toContain('.projection-content {');
    expect(source).toContain('width: 100%;');
    expect(source).not.toContain('width: calc(100% + 32px);');
    expect(source).toContain('.projection-cards {');
    expect(source).toContain('align-items: stretch;');
  });
});
