import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'data-orchestrator.service.svelte.ts'),
  'utf8'
);

describe('dataOrchestratorService restore pipeline', () => {
  it('suspends persistence while restoring the project runtime state', () => {
    expect(source).toContain(
      'await persistenceRegistry.withPersistenceSuspended(async () => {'
    );
  });

  it('restores visualizations only once after dataset processing', () => {
    const occurrences = source.match(
      /visualizationStore\.restoreFromSerialized\(vizSettings\)/g
    );

    expect(occurrences).toHaveLength(1);
    expect(source.indexOf('await processProjectFiles')).toBeLessThan(
      source.indexOf('visualizationStore.restoreFromSerialized(vizSettings)')
    );
  });

  it('does not rely on setTimeout-based geo-column restoration anymore', () => {
    expect(source).not.toContain('setTimeout(');
    expect(source).not.toContain('pendingGeoColumnRestoreTimeout');
  });

  it('marks persistence clean only after the full restore pipeline completes', () => {
    expect(
      source.indexOf('legendActions.syncWithVisualizations();')
    ).toBeLessThan(source.indexOf('persistenceRegistry.markClean();'));
  });

  it('keeps markClean outside the suspended restore block', () => {
    expect(
      source.indexOf(
        'await persistenceRegistry.withPersistenceSuspended(async () => {'
      )
    ).toBeLessThan(source.indexOf('persistenceRegistry.markClean();'));
  });

  it('clears project runtime state before restoring project files', () => {
    expect(source.indexOf('await duckDBOrchestrator.clear();')).toBeLessThan(
      source.indexOf('await processProjectFiles(')
    );
    expect(source).toContain('visualizationStore.clear();');
    expect(source).toContain('datasetsStore.clear();');
    expect(source).toContain('layersActions.reset();');
    expect(source).toContain('processedFileIds.clear();');
    expect(source).toContain('processingFiles.clear();');
  });

  it('ignores stale project restores after the runtime changes', () => {
    expect(source).toContain('const restoreRun = captureProjectRuntime();');
    expect(source).toContain('isCurrentProjectRuntime(restoreRun)');
    expect(source.indexOf('await processProjectFiles(')).toBeLessThan(
      source.indexOf('visualizationStore.restoreFromSerialized(vizSettings)')
    );
    expect(source).toContain('restoreRun');
  });
});
