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
