import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-enrichment-basemap.svelte.ts'),
  'utf8'
);

describe('useEnrichmentBasemap preview hold', () => {
  it('does not hold the map skeleton while computing basemap suggestions', () => {
    expect(source).not.toContain('shouldHoldPreviewWhileResolvingSuggestions');
    expect(source).toContain('setPreviewHold(false);');
    expect(source).toContain('setPreviewHold(false, resolutionRunId);');
    expect(source).not.toContain('setPreviewHold(shouldHoldPreview');
    expect(source).not.toContain('await tick()');
  });
});
