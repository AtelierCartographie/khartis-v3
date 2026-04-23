import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-map-layers.svelte.ts'),
  'utf8'
);

describe('useMapLayers source', () => {
  it('keeps file-backed custom basemap metadata layers available to the renderer', () => {
    expect(source).toContain('if (currentMetadata) {');
    expect(source).not.toContain(
      'if (currentMetadata && !currentMetadata.isCustom && worldBaseTable) {'
    );
    expect(source).toContain(': currentMetadata.isCustom');
    expect(source).toContain(
      'availableMetadataLayerTypes: metadataLayers.map('
    );
  });
});
