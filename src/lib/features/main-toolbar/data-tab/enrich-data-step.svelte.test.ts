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
    expect(source).not.toContain('!overlayBasemapEnabled');
    expect(source).not.toContain('suggestedBasemaps.length');
  });

  it('keeps existing overlay selections expanded without changing manual activation', () => {
    expect(source).toContain('if (overlayBasemapEnabled) {');
    expect(source).toContain('overlayBasemapExpanded = true;');
    expect(source).toContain('basemapHook.activatePreferredBasemap();');
  });
});
