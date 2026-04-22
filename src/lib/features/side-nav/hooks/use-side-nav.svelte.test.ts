import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'use-side-nav.svelte.ts'),
  'utf8'
);

describe('useSideNav delete flow', () => {
  it('does not hard-reload the page after deleting the current project', () => {
    expect(source).not.toContain('window.location.reload()');
    expect(source).toContain('await projectsStore.refresh();');
    expect(source).toContain('globalState.isCreateProjectModalOpen = true;');
  });
});
