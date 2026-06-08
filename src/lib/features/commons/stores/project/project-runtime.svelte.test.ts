import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'project-runtime.svelte.ts'),
  'utf8'
);

describe('projectRuntime', () => {
  it('exposes a non-persisted generation key for project remounts', () => {
    expect(source).toContain('const runtime = $state<ProjectRuntimeSnapshot>');
    expect(source).toContain('get runtimeKey(): string');
    expect(source).toContain(
      "return `${runtime.generation}:${runtime.projectId ?? 'empty'}`;"
    );
  });

  it('invalidates captured runtime snapshots on project transitions', () => {
    expect(source).toContain('runtime.generation += 1;');
    expect(source).toContain('runtime.projectId = projectId;');
    expect(source).toContain('snapshot.generation === runtime.generation');
    expect(source).toContain('snapshot.projectId === runtime.projectId');
  });

  it('keeps project runtime reset centralized', () => {
    expect(source).toContain('export function resetProjectRuntimeState(');
    expect(source).toContain('options: ResetProjectRuntimeStateOptions = {}');
    expect(source).toContain('if (options.resetPersistence ?? true) {');
    expect(source).toContain('persistenceRegistry.resetAll();');
    expect(source).toContain('datasetsStore.clear();');
    expect(source).toContain('basemapService.reset();');
    expect(source).toContain('projectionStore.reset();');
    expect(source).toContain('globalActions.resetNavigationState();');
    expect(source).not.toContain('resetAllStores');
  });
});
