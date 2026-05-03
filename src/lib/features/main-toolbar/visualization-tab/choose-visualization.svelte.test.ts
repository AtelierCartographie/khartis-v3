import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'choose-visualization.svelte'),
  'utf8'
);

describe('ChooseVisualization', () => {
  it('portals the delete confirmation modal and binds its open state', () => {
    expect(source).toContain(
      "import { appendToBody } from '$lib/features/commons/utils/append-to-body';"
    );
    expect(source).toContain('{#if isDeleteConfirmOpen}');
    expect(source).toContain('<div use:appendToBody>');
    expect(source).toContain('bind:open={isDeleteConfirmOpen}');
  });

  it('renders suggestion cards through the reusable card component', () => {
    expect(source).toContain(
      "import VisualizationSuggestionCard from './components/suggestion/visualization-suggestion-card.svelte';"
    );
    expect(source).toContain('<VisualizationSuggestionCard');
    expect(source).toContain(
      'activate={() => handleSelectSuggestion(suggestion)}'
    );
    expect(source).not.toContain(
      'onclick={() => handleSelectSuggestion(suggestion)}'
    );
  });

  it('keeps persisted suggestion keys visible even after a suggestion-backed viz becomes custom', () => {
    expect(source).toContain("originMode !== 'auto-suggestion'");
    expect(source).toContain("originMode !== 'manual-suggestion'");
    expect(source).toContain("originMode !== 'custom'");
  });

  it('uses the origin restore state when deciding whether a suggestion card clears', () => {
    expect(source).toContain(
      'originSuggestionKey: targetViz.origin?.suggestionKey'
    );
    expect(source).toContain(
      'hasRestoreState: Boolean(targetViz.origin?.restoreState)'
    );
  });

  it('commits visualization renames through the immediate rename action', () => {
    expect(source).toContain(
      'visualizationStore.renameVisualization(id, trimmed);'
    );
    expect(source).not.toContain(
      'visualizationStore.updateVisualization(id, { name: trimmed });'
    );
  });
});
