import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'facets-shared-renderer.svelte'),
  'utf8'
);

describe('facets shared renderer structure', () => {
  it('creates a single Deck instance and filters thematic layers by view id', () => {
    expect(source).toContain('new Deck({');
    expect(source).toContain('new OrthographicView({');
    expect(source).toContain('layerFilter: ({ layer, viewport }) => {');
    expect(source).toContain('return viewId ? viewport.id === viewId : true;');
    expect(source).toContain(
      'mapInstanceStore.setOrthographicViewStateAdapter'
    );
  });

  it('does not subscribe the redraw effect to projectionStore state that it mutates itself', () => {
    expect(source).not.toContain('void projectionStore.modelMatrix;');
    expect(source).not.toContain('void projectionStore.referenceBbox;');
  });

  it('prefers rendered dataset bounds for manual projection fits even when a joined basemap is referenced', () => {
    const helperStart = source.indexOf(
      'function shouldPreferDatasetProjectionBbox'
    );
    const helperEnd = source.indexOf(
      'function resolveRenderedReferenceBounds',
      helperStart
    );
    const helperSource = source.slice(helperStart, helperEnd);

    expect(helperSource).toContain(
      "projectionState.overrideSource === 'manual'"
    );
    expect(helperSource).toContain('Boolean(datasetBbox)');
    expect(helperSource).not.toContain('!basemapStyleStore.referenceBasemapId');
  });
});
