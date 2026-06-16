import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'project-lifecycle.ts'),
  'utf8'
);

describe('project lifecycle runtime reset', () => {
  it('starts a fresh runtime for project creation and loading', () => {
    expect(source).toContain('beginProjectRuntime(project.id);');
    expect(source.indexOf('beginProjectRuntime(project.id);')).toBeLessThan(
      source.indexOf('await dataOrchestratorService.onProjectChanged();')
    );
  });

  it('preserves deserialized stores while loading an existing project', () => {
    const loadProjectBody = source.slice(
      source.indexOf('export async function loadProject'),
      source.indexOf('export async function deleteProject')
    );

    expect(loadProjectBody).toContain('projectRepository.load(id)');
    expect(loadProjectBody).toContain(
      'resetProjectRuntimeState({ resetPersistence: false });'
    );
  });

  it('clears the runtime when deleting or clearing the current project', () => {
    const nullRuntimeResets = source.match(/beginProjectRuntime\(null\);/g);

    expect(nullRuntimeResets?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain(
      'await dataOrchestratorService.onProjectChanged();'
    );
  });

  it('does not delete the previous project when creating a new project', () => {
    const createProjectBody = source.slice(
      source.indexOf('export async function createProject'),
      source.indexOf('export async function loadProject')
    );

    expect(createProjectBody).toContain('await saveCurrentProject(container);');
    expect(createProjectBody).not.toContain('projectRepository.remove');
  });
});
