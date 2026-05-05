import { describe, expect, it } from 'vitest';
import { resolveNextBasemapSelectionId } from './basemap-selection.utils';

describe('resolveNextBasemapSelectionId', () => {
  it('returns the requested basemap when it changes', () => {
    expect(
      resolveNextBasemapSelectionId('europe-nuts1-2024', 'world-2025')
    ).toBe('world-2025');
  });

  it('returns undefined when the same basemap is selected twice', () => {
    expect(
      resolveNextBasemapSelectionId('europe-nuts1-2024', 'europe-nuts1-2024')
    ).toBeUndefined();
  });

  it('keeps the same basemap when toggle-off is explicitly disabled', () => {
    expect(
      resolveNextBasemapSelectionId('europe-nuts1-2024', 'europe-nuts1-2024', {
        allowToggleOff: false
      })
    ).toBe('europe-nuts1-2024');
  });

  it('returns undefined when no basemap id is requested', () => {
    expect(
      resolveNextBasemapSelectionId('europe-nuts1-2024', '')
    ).toBeUndefined();
  });
});
