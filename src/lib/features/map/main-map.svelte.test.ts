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

describe('MainMap map-object resize (#184)', () => {
  it('resizes the map object via page margins instead of the page format', () => {
    expect(source).toContain('formatActions.setMargins({');
    expect(source).toContain('startMargins: { ...formatState.margins }');
    expect(source).not.toContain('formatActions.setSize(');
    expect(source).not.toContain('formatActions.setMode(');
  });

  it('frames the resize handles on the map area inside the margins, not the page', () => {
    expect(source).toContain('const mapAreaInsetLeftPx = $derived(');
    expect(source).toContain('const mapAreaWidthPx = $derived(');
    expect(source).toContain(
      'style="left: {mapAreaInsetLeftPx}px; top: {mapAreaInsetTopPx}px; width: {mapAreaWidthPx}px; height: {mapAreaHeightPx}px;"'
    );
  });

  it('grows the margin when an edge is dragged inward and shrinks it when dragged outward', () => {
    expect(source).toContain('right = startMargins.right - dx');
    expect(source).toContain('left = startMargins.left + dx');
    expect(source).toContain('bottom = startMargins.bottom - dy');
    expect(source).toContain('top = startMargins.top + dy');
  });
});
