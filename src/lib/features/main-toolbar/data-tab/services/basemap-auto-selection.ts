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
