import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
import type { VisualizationOriginMode } from '$lib/features/commons/stores/visualization.store.svelte';

type SuggestionSignatureSource = Pick<
  VizSuggestion,
  'id' | 'nbColumns' | 'columns' | 'geometries' | 'semioTypes'
>;

interface AutoApplySuggestionOptions {
  hasPersistedSuggestionKey?: boolean;
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
  originMode?: VisualizationOriginMode;
  hasRestoreState?: boolean;
  isTargetActive?: boolean;
}

interface IncludePersistedSuggestionOptions {
  hasAppliedSuggestionState?: boolean;
  hasPersistedSuggestionKey?: boolean;
  originMode?: VisualizationOriginMode;
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

export function parseSuggestionSignature(
  signature: string | undefined
): VizSuggestion | undefined {
  if (!signature) {
    return undefined;
  }

  const [id, nbColumnsText, columnsText, geometriesText, semioTypesText] =
    signature.split('::');

  if (
    !id ||
    nbColumnsText === undefined ||
    columnsText === undefined ||
    geometriesText === undefined ||
    semioTypesText === undefined
  ) {
    return undefined;
  }

  const nbColumns = Number(nbColumnsText);
  if (!Number.isFinite(nbColumns)) {
    return undefined;
  }

  return {
    id,
    label: id,
    nbColumns,
    columns: columnsText ? columnsText.split('|') : [],
    geometries: geometriesText
      ? (geometriesText.split('|') as VizSuggestion['geometries'])
      : [],
    semioTypes: semioTypesText
      ? (semioTypesText.split('|') as VizSuggestion['semioTypes'])
      : []
  };
}

export function includePersistedSuggestion(
  suggestions: VizSuggestion[],
  suggestionKey: string | undefined,
  dataGeometry?: VizSuggestion['dataGeometry']
): VizSuggestion[] {
  if (!suggestionKey) {
    return suggestions;
  }

  if (
    suggestions.some(
      (suggestion) => getSuggestionSignature(suggestion) === suggestionKey
    )
  ) {
    return suggestions;
  }

  const persistedSuggestion = parseSuggestionSignature(suggestionKey);
  if (!persistedSuggestion) {
    return suggestions;
  }

  return [{ ...persistedSuggestion, dataGeometry }, ...suggestions];
}

export function shouldIncludePersistedSuggestion({
  hasAppliedSuggestionState = false,
  hasPersistedSuggestionKey = false,
  originMode
}: IncludePersistedSuggestionOptions): boolean {
  if (!hasPersistedSuggestionKey) {
    return false;
  }

  if (originMode === 'auto-suggestion' || originMode === 'manual-suggestion') {
    return true;
  }

  return originMode === 'manual-blank' && hasAppliedSuggestionState;
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

  if (
    typeof currentSuggestion !== 'string' &&
    currentSuggestion?.isTargetActive === false
  ) {
    return 'apply';
  }

  if (displayedSuggestionKey === nextSuggestionKey) {
    return 'clear';
  }

  if (
    typeof currentSuggestion !== 'string' &&
    currentSuggestion?.hasRestoreState &&
    (currentSuggestion.originMode === undefined ||
      currentSuggestion.originMode === 'auto-suggestion' ||
      currentSuggestion.originMode === 'manual-suggestion') &&
    currentSuggestion.originSuggestionKey === nextSuggestionKey
  ) {
    return 'clear';
  }

  return 'apply';
}

export function shouldAutoApplySuggestion({
  hasPersistedSuggestionKey = false,
  suggestionCount,
  visualizationCount,
  targetVisualizationOriginMode
}: AutoApplySuggestionOptions): boolean {
  return (
    !hasPersistedSuggestionKey &&
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
  if (originMode === 'manual-blank' || originMode === 'custom') {
    return undefined;
  }
  if (persistedSuggestionKey) return persistedSuggestionKey;
  return matchedSuggestionKey;
}
