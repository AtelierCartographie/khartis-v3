import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'enrich-data-step.svelte'),
  'utf8'
);

describe('EnrichDataStep overlay basemap defaults', () => {
  it('does not auto-open or auto-select the overlay basemap from suggestions', () => {
    expect(source).not.toContain('overlayBasemapSuggestionCount');
    expect(source).not.toContain('basemapHook.hasActiveSelection');
    expect(source).not.toContain('suggestedBasemaps.length');
  });

  it('drives overlay state from the persisted store flag, not derived selection', () => {
    expect(source).toContain('dataTabState.enrichData.overlayBasemapEnabled');
    expect(source).toContain(
      'dataTabActions.setEnrichDataState({ overlayBasemapEnabled: checked })'
    );
    expect(source).toContain('basemapHook.activatePreferredBasemap();');
    expect(source).toContain('basemapHook.clearSelectedBasemap();');
  });

  it('resets the overlay flag when the selected dataset changes', () => {
    expect(source).toContain('overlayBasemapEnabled: false');
  });
});
