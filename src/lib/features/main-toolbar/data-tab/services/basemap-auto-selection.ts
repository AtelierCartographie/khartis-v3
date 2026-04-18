export interface SuggestedBasemapAutoSelectionInput {
  hasDismissedSuggestedBasemap: boolean;
  suggestionCount: number;
  isOSMActive: boolean;
  hasDatasetGeometry: boolean;
  persistedBasemapId?: string | null;
  selectedBasemapId?: string;
  hasSelectedAvailableBasemap?: boolean;
  shouldRetryForDatasetChange?: boolean;
}

export type SuggestedBasemapAutoSelectionTarget = 'none' | 'suggested' | 'osm';

export interface ResolveSuggestedBasemapAutoSelectionTargetInput extends SuggestedBasemapAutoSelectionInput {
  preferOSM?: boolean;
}

/**
 * Per CDC [DATA-09b]: the best suggestion must be selected by default.
 * The ranking layers ({@link rankBasemapsByJoinSynthesis} for textual matches,
 * {@link rankBasemapsByGPSBbox} for bbox-only) already departs ties using
 * granularity / year / filename, so the first suggestion is the canonical pick.
 * Any "ambiguity surfacing" should happen in the UI (e.g. showing all top-scored
 * suggestions to the user) — not by suppressing the default selection here.
 */
export function shouldAutoSelectSuggestedBasemap(
  input: SuggestedBasemapAutoSelectionInput
): boolean {
  return (
    !input.hasDismissedSuggestedBasemap &&
    input.suggestionCount > 0 &&
    !input.isOSMActive &&
    !input.hasDatasetGeometry &&
    !input.persistedBasemapId &&
    (input.shouldRetryForDatasetChange ||
      !input.selectedBasemapId ||
      !input.hasSelectedAvailableBasemap)
  );
}

export function resolveSuggestedBasemapAutoSelectionTarget(
  input: ResolveSuggestedBasemapAutoSelectionTargetInput
): SuggestedBasemapAutoSelectionTarget {
  if (!shouldAutoSelectSuggestedBasemap(input)) {
    return 'none';
  }

  return input.preferOSM ? 'osm' : 'suggested';
}
