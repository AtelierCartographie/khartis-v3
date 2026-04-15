import type { VizSuggestion } from '$lib/features/commons/services/viz-suggester.service';
import type {
  VisualizationConfig,
  VisualizationOriginMode
} from '$lib/features/commons/store/visualization.store.svelte';

type SuggestionSignatureSource = Pick<
  VizSuggestion,
  'id' | 'nbColumns' | 'columns' | 'geometries' | 'semioTypes'
>;

interface AutoApplySuggestionOptions {
  suggestionCount: number;
  visualizationCount: number;
  targetVisualizationOriginMode: VisualizationOriginMode;
}

function normalizeClassificationForSuggestionFingerprint(
  classification: VisualizationConfig['classification']
) {
  if (!classification) {
    return null;
  }

  return {
    method: classification.method,
    paletteId: classification.paletteId ?? null,
    inverted: classification.inverted ?? null,
    breakpointValue: classification.breakpointValue ?? null,
    patternId: classification.patternId ?? null,
    patternParams: classification.patternParams ?? null
  };
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
  currentSuggestionKey: string | undefined,
  nextSuggestion: SuggestionSignatureSource
): 'apply' | 'clear' {
  return currentSuggestionKey === getSuggestionSignature(nextSuggestion)
    ? 'clear'
    : 'apply';
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

export function getVisualizationSuggestionFingerprint(
  visualization: Pick<
    VisualizationConfig,
    | 'type'
    | 'modes'
    | 'primitiveFilters'
    | 'style'
    | 'mapping'
    | 'classification'
    | 'symbols'
    | 'missingData'
  >
): string {
  return JSON.stringify({
    type: visualization.type,
    modes: visualization.modes ?? null,
    primitiveFilters: visualization.primitiveFilters ?? null,
    style: visualization.style ?? null,
    mapping: visualization.mapping ?? null,
    classification: normalizeClassificationForSuggestionFingerprint(
      visualization.classification
    ),
    symbols: visualization.symbols ?? null,
    missingData: visualization.missingData ?? null
  });
}
