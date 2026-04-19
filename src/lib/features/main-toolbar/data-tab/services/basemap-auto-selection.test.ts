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

  it('prefers OSM for GPS datasets when auto-selection is allowed', () => {
    expect(
      resolveSuggestedBasemapAutoSelectionTarget({
        hasDismissedSuggestedBasemap: false,
        suggestionCount: 3,
        isOSMActive: false,
        hasDatasetGeometry: false,
        persistedBasemapId: undefined,
        selectedBasemapId: undefined,
        preferOSM: true
      })
    ).toBe('osm');
  });

  it('keeps catalog suggestion auto-selection for non-GPS datasets', () => {
    expect(
      resolveSuggestedBasemapAutoSelectionTarget({
        hasDismissedSuggestedBasemap: false,
        suggestionCount: 2,
        isOSMActive: false,
        hasDatasetGeometry: false,
        persistedBasemapId: undefined,
        selectedBasemapId: undefined,
        preferOSM: false
      })
    ).toBe('suggested');
  });
});
