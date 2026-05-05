import { describe, expect, it } from 'vitest';
import {
  resolveSuggestedBasemapAutoSelectionTarget,
  shouldAutoSelectSuggestedBasemap
} from './basemap-auto-selection';

describe('shouldAutoSelectSuggestedBasemap', () => {
  it('blocks auto-selection after a manual dismissal', () => {
    expect(
      shouldAutoSelectSuggestedBasemap({
        hasDismissedSuggestedBasemap: true,
        suggestionCount: 2,
        isOSMActive: false,
        hasDatasetGeometry: false,
        persistedBasemapId: undefined,
        selectedBasemapId: undefined
      })
    ).toBe(false);
  });

  it('allows auto-selection again when the dataset identity changes', () => {
    expect(
      shouldAutoSelectSuggestedBasemap({
        hasDismissedSuggestedBasemap: false,
        suggestionCount: 1,
        isOSMActive: false,
        hasDatasetGeometry: false,
        persistedBasemapId: undefined,
        selectedBasemapId: 'obsolete-basemap',
        hasSelectedAvailableBasemap: false,
        shouldRetryForDatasetChange: true
      })
    ).toBe(true);
  });

  it('keeps catalog suggestion auto-selection when GPS datasets have suggestions', () => {
    expect(
      resolveSuggestedBasemapAutoSelectionTarget({
        hasDismissedSuggestedBasemap: false,
        suggestionCount: 3,
        isOSMActive: false,
        hasDatasetGeometry: false,
        persistedBasemapId: undefined,
        selectedBasemapId: undefined
      })
    ).toBe('suggested');
  });

  it('keeps catalog suggestion auto-selection for non-GPS datasets', () => {
    expect(
      resolveSuggestedBasemapAutoSelectionTarget({
        hasDismissedSuggestedBasemap: false,
        suggestionCount: 2,
        isOSMActive: false,
        hasDatasetGeometry: false,
        persistedBasemapId: undefined,
        selectedBasemapId: undefined
      })
    ).toBe('suggested');
  });
});
