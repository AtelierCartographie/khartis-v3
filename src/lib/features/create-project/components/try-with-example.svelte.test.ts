import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'try-with-example.svelte'),
  'utf8'
);

const examplesSource = readFileSync(
  resolve(import.meta.dirname, '../../commons/constants/examples.data.ts'),
  'utf8'
);

const typesSource = readFileSync(
  resolve(import.meta.dirname, '../../commons/types/create-project.types.ts'),
  'utf8'
);

const exampleThumbnailSources = [
  'world-population-thumb.svg',
  'european-cities-thumb.svg',
  'world-countries-thumb.svg',
  'gdp-evolution-thumb.svg',
  'transport-flows-thumb.svg'
].map((fileName) =>
  readFileSync(
    resolve(import.meta.dirname, '../../../../../static/examples', fileName),
    'utf8'
  )
);

describe('try-with-example project initialization', () => {
  it('mirrors finalized catalog joins into the dataset store before rendering visualizations', () => {
    expect(source).toContain(
      'await duckDBOrchestrator.finalizeJoin(dataset.id, basemap, geoColumn);'
    );
    expect(source).toContain(
      'datasetsStore.updateDatasetJoinBasemap(dataset.id, basemap.file);'
    );
    expect(
      source.indexOf('datasetsStore.updateDatasetJoinBasemap')
    ).toBeLessThan(source.indexOf('applyReferenceBasemapToProject(basemap);'));
  });

  it('persists the full DuckDB analysis and saves after presets are applied', () => {
    expect(source).toContain('duckDBOrchestrator.getFullAnalysis(');
    expect(source).not.toContain('Duck.analyse');
    expect(source).toContain(
      'applyExampleVisualizations(example, processedExampleFile);'
    );
    expect(source).toContain('await projectStore.saveCurrentProject({');
    expect(source).toContain('fallbackThumbnail: example.thumbnail');
    expect(
      source.indexOf(
        'applyExampleVisualizations(example, processedExampleFile);'
      )
    ).toBeLessThan(source.indexOf('await projectStore.saveCurrentProject({'));
  });

  it('does not restore the project runtime after applying example presets', () => {
    const loadTail = source.slice(
      source.indexOf(
        'applyExampleVisualizations(example, processedExampleFile);'
      )
    );

    expect(loadTail).toContain('await projectStore.saveCurrentProject({');
    expect(loadTail).not.toContain('dataOrchestratorService.onProjectChanged');
  });

  it('supports explicit reference basemaps for GPS-only examples', () => {
    expect(typesSource).toContain('referenceBasemapId?: string;');
    expect(examplesSource).toContain("id: 'european-cities'");
    expect(examplesSource).toContain(
      "referenceBasemapId: 'europe-nuts1-2024-medium'"
    );
    expect(source).toContain('await applyExampleReferenceBasemap(example);');
  });

  it('uses existing SVG thumbnails for every bundled example card', () => {
    expect(examplesSource).toContain('/examples/world-population-thumb.svg');
    expect(examplesSource).toContain('/examples/european-cities-thumb.svg');
    expect(examplesSource).toContain('/examples/world-countries-thumb.svg');
    expect(examplesSource).toContain('/examples/gdp-evolution-thumb.svg');
    expect(examplesSource).toContain('/examples/transport-flows-thumb.svg');
    expect(examplesSource).not.toContain('-thumb.png');
  });

  it('keeps bundled example thumbnails on a white background', () => {
    for (const thumbnailSource of exampleThumbnailSources) {
      expect(thumbnailSource).toContain('fill="#ffffff"');
      expect(thumbnailSource).not.toContain('#f4f4f4');
    }
  });

  it('matches saved project card height instead of forcing extra height', () => {
    expect(source).not.toContain('height: 15.5rem');
    expect(source).toContain('-webkit-line-clamp: 1;');
    expect(source).toContain('min-height: 1lh;');
    expect(source).toContain(
      '.example-project-card :global(#kh-card .top-section > svg) {\n    width: 1.5rem;\n    height: 1.5rem;'
    );
  });

  it('synchronises the in-memory geolocation linked variable with the catalog join geoColumn', () => {
    expect(source).toContain('syncGeolocationStateForCatalogJoin(');
    expect(source).toContain('geoReference: GeoreferenceType.ENTITIES');
    expect(source).toContain('linkedVariableName: geoColumn');
    expect(
      source.indexOf('await duckDBOrchestrator.finalizeJoin(')
    ).toBeLessThan(source.indexOf('syncGeolocationStateForCatalogJoin('));
  });
});
