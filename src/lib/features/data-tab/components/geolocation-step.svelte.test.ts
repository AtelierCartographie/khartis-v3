import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'geolocation-step.svelte'),
  'utf8'
);

describe('GeolocationStep auto-selection guards', () => {
  it('mirrors the existing DuckDB join column instead of re-suggesting one when the join is already active', () => {
    const autoSelectBranchIndex = source.indexOf(
      'if (linkedVar === null && !linkedName && suggested)'
    );
    expect(autoSelectBranchIndex).toBeGreaterThan(-1);

    const guardWindow = source.slice(
      Math.max(0, autoSelectBranchIndex - 800),
      autoSelectBranchIndex
    );

    expect(guardWindow).toContain(
      'duckDBOrchestrator.getDatasetBySourceFile(sourceFileId)'
    );
    expect(guardWindow).toContain('duckDataset.geoColumn');
    expect(guardWindow).toContain('duckDataset.joinedBasemap');
    expect(guardWindow).toContain('!duckDataset.gpsMode');
    expect(guardWindow).toContain(
      'linkedVariableName: existingJoinColumn.columnName'
    );
  });
});
