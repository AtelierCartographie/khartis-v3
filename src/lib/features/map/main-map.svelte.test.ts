import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'main-map.svelte'),
  'utf8'
);

describe('MainMap joined basemap display loading', () => {
  it('loads display data from the dataset store while DuckDB metadata is catching up', () => {
    expect(source).toContain(
      'duckDBDataset?.joinedBasemap ?? dataset.joinedBasemap'
    );
    expect(source).toContain('duckDBDataset?.tableName ?? dataset.tableName');
    expect(source).toContain(
      'await loadJoinedBasemap(dataset, joinedBasemap, tableName, generation);'
    );
  });

  it('does not leave joined-basemap debug probes in the map runtime', () => {
    expect(source).not.toContain('__khartisLoadJoinDebug');
    expect(source).not.toContain('Debug compare failed');
  });

  it('falls back to the materialized joined table when split rendering cannot match basemap ids', () => {
    expect(source).toContain('if (featureIdColumn) {');
    expect(source).toContain('setDisplaySplitTable(datasetId, {');
    expect(source).toContain(
      'const joinedTable = await duckDBOrchestrator.getJoinedArrowTable'
    );
  });
});
