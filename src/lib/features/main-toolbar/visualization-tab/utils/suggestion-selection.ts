import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
import type { VisualizationOriginMode } from '$lib/features/commons/store/visualization.store.svelte';

type SuggestionSignatureSource = Pick<
  VizSuggestion,
  'id' | 'nbColumns' | 'columns' | 'geometries' | 'semioTypes'
>;

interface AutoApplySuggestionOptions {
  suggestionCount: number;
  visualizationCount: number;
  targetVisualizationOriginMode: VisualizationOriginMode;
}

interface ResolveDisplayedSuggestionKeyOptions {
  selectedSuggestionKey?: string;
  persistedSuggestionKey?: string;
  matchedSuggestionKey?: string;
  originMode?: VisualizationOriginMode;
}

interface ResolveSuggestionCardActionOptions {
  displayedSuggestionKey?: string;
  originSuggestionKey?: string;
  hasRestoreState?: boolean;
}

export function getSuggestionSignature(
  suggestion: SuggestionSignatureSource
): string {
  return [
    suggestion.id,
    suggestion.nbColumns,
    (suggestion.columns ?? []).join('|'),
    suggestion.geometries.join('|'),
    suggestion.semioTypes.join('|')
  ].join('::');
}

export function resolveSuggestionCardAction(
  currentSuggestion: string | ResolveSuggestionCardActionOptions | undefined,
  nextSuggestion: SuggestionSignatureSource
): 'apply' | 'clear' {
  const nextSuggestionKey = getSuggestionSignature(nextSuggestion);
  const displayedSuggestionKey =
    typeof currentSuggestion === 'string'
      ? currentSuggestion
      : currentSuggestion?.displayedSuggestionKey;

  if (displayedSuggestionKey === nextSuggestionKey) {
    return 'clear';
  }

  if (
    typeof currentSuggestion !== 'string' &&
    currentSuggestion?.hasRestoreState &&
    currentSuggestion.originSuggestionKey === nextSuggestionKey
  ) {
    return 'clear';
  }

  return 'apply';
}

export function shouldAutoApplySuggestion({
  suggestionCount,
  visualizationCount,
  targetVisualizationOriginMode
}: AutoApplySuggestionOptions): boolean {
  return (
    suggestionCount > 0 &&
    visualizationCount === 1 &&
    targetVisualizationOriginMode === 'auto-suggestion'
  );
}

export function resolveDisplayedSuggestionKey({
  selectedSuggestionKey,
  persistedSuggestionKey,
  matchedSuggestionKey,
  originMode
}: ResolveDisplayedSuggestionKeyOptions): string | undefined {
  if (selectedSuggestionKey) return selectedSuggestionKey;
  if (persistedSuggestionKey) return persistedSuggestionKey;
  if (originMode === 'manual-blank' || originMode === 'custom') {
    return undefined;
  }
  return matchedSuggestionKey;
}
