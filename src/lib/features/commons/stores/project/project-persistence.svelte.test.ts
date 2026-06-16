import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'project-persistence.ts'),
  'utf8'
);

describe('project persistence import flow', () => {
  it('uses a captured map thumbnail before the save fallback thumbnail', () => {
    const saveProjectBody = source.slice(
      source.indexOf('export async function saveCurrentProject'),
      source.indexOf('export async function exportProject')
    );

    expect(source).toContain('fallbackThumbnail?: string;');
    expect(saveProjectBody).toContain(
      'captureMapThumbnail()?.dataUrl ?? options.fallbackThumbnail'
    );
    expect(saveProjectBody).toContain(
      'await projectRepository.save(container._state.currentProject, thumbnail);'
    );
  });

  it('preserves deserialized stores while importing a project archive', () => {
    const importProjectBody = source.slice(
      source.indexOf('export async function importProject'),
      source.indexOf('export function markDirty')
    );

    expect(importProjectBody).toContain('projectFiles.importProject(file)');
    expect(importProjectBody).toContain(
      'resetProjectRuntimeState({ resetPersistence: false });'
    );
  });
});
