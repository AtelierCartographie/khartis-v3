import { PipelineError } from '$lib/features/commons/pipeline.errors';
import * as m from '$lib/paraglide/messages';
import { PROJECT_CONST } from '../constants';

const SCHEMA_MIGRATION_FAILED_ERROR_CODE = 'SCHEMA_MIGRATION_FAILED';
const UNSUPPORTED_PROJECT_SCHEMA_ERROR_CODE =
  'UNSUPPORTED_PROJECT_SCHEMA_VERSION';

export interface SchemaMigration {
  from: string;
  to: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

// No-op on purpose: the bump fences off builds that would drop basemap source assets on save.
export const schemaMigrations: readonly SchemaMigration[] = [
  {
    from: '3.9.0',
    to: '3.10.0',
    migrate: (data) => ({ ...data })
  }
];

function throwUnsupportedSchemaVersion(receivedVersion: unknown): never {
  const version =
    typeof receivedVersion === 'string' && receivedVersion.length > 0
      ? receivedVersion
      : 'unknown';

  throw new PipelineError(
    m.error_unsupported_project_schema({
      version,
      baselineVersion: PROJECT_CONST.SCHEMA_BASELINE_VERSION,
      currentVersion: PROJECT_CONST.SCHEMA_VERSION
    }),
    UNSUPPORTED_PROJECT_SCHEMA_ERROR_CODE,
    {
      receivedVersion: version,
      baselineVersion: PROJECT_CONST.SCHEMA_BASELINE_VERSION,
      currentVersion: PROJECT_CONST.SCHEMA_VERSION
    }
  );
}

function readSchemaVersion(data: { manifest?: unknown }): string {
  const manifest = isRecord(data.manifest) ? data.manifest : null;
  const version = manifest?.version;

  if (typeof version !== 'string' || version.length === 0) {
    throwUnsupportedSchemaVersion(version);
  }

  return version;
}

export function assertCurrentProjectSchema(data: { manifest?: unknown }): void {
  const version = readSchemaVersion(data);
  if (version !== PROJECT_CONST.SCHEMA_VERSION) {
    throwUnsupportedSchemaVersion(version);
  }
}

function applyMigration(
  data: Record<string, unknown>,
  migration: SchemaMigration
): Record<string, unknown> {
  try {
    const migrated = migration.migrate(data);
    const manifest = isRecord(migrated.manifest) ? migrated.manifest : null;
    if (!manifest) {
      throw new Error('Migration removed the project manifest');
    }

    return {
      ...migrated,
      manifest: {
        ...manifest,
        version: migration.to
      }
    };
  } catch (error) {
    throw new PipelineError(
      m.error_schema_migration_failed({
        fromVersion: migration.from,
        toVersion: migration.to
      }),
      SCHEMA_MIGRATION_FAILED_ERROR_CODE,
      {
        fromVersion: migration.from,
        toVersion: migration.to,
        originalError: error instanceof Error ? error.message : String(error)
      }
    );
  }
}

export function migrateIfNeeded(
  data: Record<string, unknown>
): Record<string, unknown> {
  let currentVersion = readSchemaVersion(data);
  let migrated = data;
  const visitedVersions = new Set<string>();

  while (currentVersion !== PROJECT_CONST.SCHEMA_VERSION) {
    if (visitedVersions.has(currentVersion)) {
      throwUnsupportedSchemaVersion(currentVersion);
    }
    visitedVersions.add(currentVersion);

    const migration = schemaMigrations.find(
      (candidate) => candidate.from === currentVersion
    );
    if (!migration) {
      throwUnsupportedSchemaVersion(currentVersion);
    }

    migrated = applyMigration(migrated, migration);
    currentVersion = migration.to;
  }

  return migrated;
}
