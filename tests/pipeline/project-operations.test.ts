import { describe, expect, it, vi } from 'vitest';
import { duplicateProject } from '$lib/features/project-management/operations/duplicate';
import { PROJECT_CONST } from '$lib/features/project-management/constants';
import type { KhartisProject } from '$lib/features/project-management/types';

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() },
  LogCategory: { PERSISTENCE: 'PERSISTENCE' }
}));

function makeProject(overrides: Partial<KhartisProject> = {}): KhartisProject {
  return {
    id: 'original-id',
    manifest: {
      version: PROJECT_CONST.APP_VERSION,
      name: 'My Project',
      format: 'kh',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    },
    data: { sourceFiles: [] },
    ...overrides
  };
}

// ─── duplicateProject ──────────────────────────────────────────────────────

describe('duplicateProject', () => {
  it('returns a new object with a different id', () => {
    const original = makeProject();
    const dup = duplicateProject(original, 'Copy');
    expect(dup.id).not.toBe(original.id);
    expect(dup.id).toBeTruthy();
  });

  it('does not mutate the original project', () => {
    const original = makeProject();
    const originalId = original.id;
    const originalName = original.manifest.name;
    duplicateProject(original, 'Copy');
    expect(original.id).toBe(originalId);
    expect(original.manifest.name).toBe(originalName);
  });

  it('applies sanitized name to the duplicate', () => {
    const original = makeProject();
    const dup = duplicateProject(original, '  My  Copy  ');
    expect(dup.manifest.name).toBe('My Copy');
  });

  it('strips forbidden filename characters from the name', () => {
    const original = makeProject();
    const dup = duplicateProject(original, 'proj<>:"bad');
    expect(dup.manifest.name).not.toMatch(/[<>:"]/);
  });

  it('sets createdAt and updatedAt to same new timestamp', () => {
    const before = Date.now();
    const dup = duplicateProject(makeProject(), 'Copy');
    const after = Date.now();
    expect(dup.manifest.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(dup.manifest.createdAt.getTime()).toBeLessThanOrEqual(after);
    expect(dup.manifest.createdAt.getTime()).toBe(
      dup.manifest.updatedAt.getTime()
    );
  });

  it('preserves the original manifest fields other than name/timestamps', () => {
    const original = makeProject({
      manifest: {
        ...makeProject().manifest,
        version: PROJECT_CONST.APP_VERSION,
        author: 'Jean',
        format: 'kh'
      }
    });
    const dup = duplicateProject(original, 'Copy');
    expect(dup.manifest.version).toBe(PROJECT_CONST.APP_VERSION);
    expect(dup.manifest.format).toBe('kh');
    expect(dup.manifest.author).toBe('Jean');
  });

  it('deep clones data — modifying clone does not affect original', () => {
    const original = makeProject({
      data: { sourceFiles: [{ id: 'f1', name: 'file.csv' } as never] }
    });
    const dup = duplicateProject(original, 'Copy');
    dup.data.sourceFiles.push({ id: 'f2', name: 'other.csv' } as never);
    expect(original.data.sourceFiles).toHaveLength(1);
  });
});
