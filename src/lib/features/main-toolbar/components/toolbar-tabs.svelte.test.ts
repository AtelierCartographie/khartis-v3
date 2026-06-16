import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'toolbar-tabs.svelte'),
  'utf8'
);

describe('ToolbarTabs dataset rename persistence', () => {
  it('awaits the persistent dataset rename path from the tab menu', () => {
    expect(source).toContain('async function saveDatasetRename()');
    expect(source).toContain(
      'await datasetsStore.renameDataset(datasetId, nextName);'
    );
    expect(source).not.toContain('renameDatasetOnly(');
  });

  it('keeps file tab rename on the persistent source-file path', () => {
    expect(source).toContain(
      'await projectStore.renameFile(editingTabId, newFullName);'
    );
  });

  it('selects the duplicated dataset virtual tab after duplication', () => {
    expect(source).toContain(
      'const newDatasetId = await datasetsStore.duplicateDataset'
    );
    expect(source).toContain(
      'globalActions.selectDataButton(newDataset.sourceFileId);'
    );
    expect(source).toContain('await tick();');
    expect(source).toContain(
      'await dataOrchestratorService.restoreSelectedDataTabState();'
    );
  });

  it('shows the visualisation title in the tab, truncated with a browser-style minimum width', () => {
    expect(source).toContain('{vizTab.label}');
    expect(source).toContain('aria-label={vizTab.label}');
    expect(source).toContain('min-width: 5.5rem;');
    expect(source).not.toContain('shortLabel');
  });

  it('hides generated facet visualisations from the main tab bar', () => {
    expect(source).toContain(
      'visualizationStore.visualizations.filter((viz) => !viz.facet);'
    );
  });
});
