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
});
