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

  it('persists the full DuckDB analysis and flushes autosave after presets are applied', () => {
    expect(source).toContain('duckDBOrchestrator.getFullAnalysis(');
    expect(source).not.toContain('Duck.analyse');
    expect(source).toContain(
      'applyExampleVisualizations(example, processedExampleFile);'
    );
    expect(source).toContain('await persistenceRegistry.flush();');
    expect(
      source.indexOf(
        'applyExampleVisualizations(example, processedExampleFile);'
      )
    ).toBeLessThan(source.indexOf('await persistenceRegistry.flush();'));
  });

  it('supports explicit reference basemaps for GPS-only examples', () => {
    expect(typesSource).toContain('referenceBasemapId?: string;');
    expect(examplesSource).toContain("id: 'european-cities'");
    expect(examplesSource).toContain(
      "referenceBasemapId: 'europe-nuts1-2024-medium'"
    );
    expect(source).toContain('await applyExampleReferenceBasemap(example);');
  });
});
