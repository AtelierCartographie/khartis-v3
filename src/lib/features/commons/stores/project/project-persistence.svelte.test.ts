import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'project-persistence.ts'),
  'utf8'
);

describe('project persistence import flow', () => {
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
