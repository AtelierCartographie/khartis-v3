import { describe, expect, it } from 'vitest';
import { PROJECT_CONST } from '$lib/features/project-management/constants';
import {
  assertCurrentProjectSchema,
  migrateIfNeeded,
  schemaMigrations
} from '$lib/features/project-management/core/schema-migration';

describe('project schema compatibility', () => {
  it('should keep a continuous migration chain from the public baseline', () => {
    const firstSupportedVersion =
      schemaMigrations[0]?.from ?? PROJECT_CONST.SCHEMA_VERSION;
    const lastSupportedVersion =
      schemaMigrations[schemaMigrations.length - 1]?.to ??
      PROJECT_CONST.SCHEMA_BASELINE_VERSION;

    expect(firstSupportedVersion).toBe(PROJECT_CONST.SCHEMA_BASELINE_VERSION);
    for (let index = 0; index < schemaMigrations.length - 1; index += 1) {
      expect(schemaMigrations[index].to).toBe(schemaMigrations[index + 1].from);
    }
    expect(lastSupportedVersion).toBe(PROJECT_CONST.SCHEMA_VERSION);
  });

  it('should preserve a project already using the current schema', () => {
    const project = {
      manifest: {
        version: PROJECT_CONST.SCHEMA_VERSION,
        name: 'Current project',
        extension: 'preserved'
      },
      data: { extension: 42 }
    };

    expect(migrateIfNeeded(project)).toBe(project);
    expect(() => assertCurrentProjectSchema(project)).not.toThrow();
  });

  it('should reject a pre-production schema without silently restamping it', () => {
    expect(() =>
      migrateIfNeeded({
        manifest: { version: '3.8.0', name: 'Pre-production project' }
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROJECT_SCHEMA_VERSION',
        details: expect.objectContaining({
          receivedVersion: '3.8.0',
          baselineVersion: PROJECT_CONST.SCHEMA_BASELINE_VERSION,
          currentVersion: PROJECT_CONST.SCHEMA_VERSION
        })
      })
    );
    expect(() =>
      assertCurrentProjectSchema({ manifest: { version: '3.8.0' } })
    ).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROJECT_SCHEMA_VERSION'
      })
    );
  });

  it('should reject an unknown future schema', () => {
    expect(() =>
      migrateIfNeeded({
        manifest: { version: '99.0.0', name: 'Future project' }
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROJECT_SCHEMA_VERSION',
        details: expect.objectContaining({ receivedVersion: '99.0.0' })
      })
    );
  });

  it('should reject a project without a schema version', () => {
    expect(() =>
      migrateIfNeeded({ manifest: { name: 'Unversioned project' } })
    ).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_PROJECT_SCHEMA_VERSION',
        details: expect.objectContaining({ receivedVersion: 'unknown' })
      })
    );
  });
});
