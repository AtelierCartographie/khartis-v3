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

  it('restores facets after datasets and visualizations are available', () => {
    expect(source).toContain('const facetsSettings = (');
    expect(source).toContain(
      'persistenceRegistry.deserializeAll({ facets: facetsSettings });'
    );
    expect(source).toContain(
      'await facetsStore.restoreGeneratedVisualizations();'
    );
    expect(source.indexOf('await processProjectFiles')).toBeLessThan(
      source.indexOf(
        'persistenceRegistry.deserializeAll({ facets: facetsSettings });'
      )
    );
    expect(
      source.indexOf('visualizationStore.restoreFromSerialized(vizSettings)')
    ).toBeLessThan(
      source.indexOf('await facetsStore.restoreGeneratedVisualizations();')
    );
  });

  it('restores layout stores after the runtime reset and before legend sync', () => {
    expect(source).toContain('const layoutSettings = (');
    expect(source).toContain('format: layoutSettings.format');
    expect(source).toContain('annotations: layoutSettings.annotations');
    expect(source).toContain('legend: layoutSettings.legend');
    expect(source).toContain('geoIndications: layoutSettings.geoIndications');
    expect(
      source.indexOf('visualizationStore.restoreFromSerialized(vizSettings)')
    ).toBeLessThan(source.indexOf('format: layoutSettings.format'));
    expect(source.indexOf('legend: layoutSettings.legend')).toBeLessThan(
      source.indexOf('legendActions.syncWithVisualizations();')
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

  it('restores the selected source join state after a live file removal', () => {
    expect(source).toContain('restoreSelectedDataTabState');
    expect(source.indexOf('cleanupOrphanedDatasets();')).toBeLessThan(
      source.indexOf('await restoreSelectedDataTabState();')
    );
    expect(source).toContain('globalActions.ensureTabSelected();');
    expect(source).toContain('allowFallbackToAnyJoinedFile: false');
  });

  it('recomputes and finalizes the restored tabular join before marking it complete', () => {
    expect(source).toContain('restoreTabularJoinCompletion');
    expect(source).toContain('duckDBOrchestrator.computeJoinStats(');
    expect(source).toContain('dataTabActions.setJoinStats(stats);');
    expect(source).toContain('await duckDBOrchestrator.finalizeJoin(');
    expect(source).toContain('dataTabStore.markStepComplete(stepIndex);');
  });

  it('guards restored tabular joins with the active project runtime snapshot', () => {
    expect(source).toContain('restoreRun: ProjectRuntimeSnapshot');
    expect(source).toContain('restoreTabularJoinCompletion(');
    expect(source).toContain('!isCurrentProjectRuntime(restoreRun)');
    expect(source).toContain(
      'await restorePersistedDataTabState(\n            currentProject,\n            restoreToken,\n            restoreRun'
    );
  });
});
