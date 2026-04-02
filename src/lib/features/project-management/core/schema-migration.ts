/**
 * Schema migration system for project persistence.
 *
 * When the serialized project format evolves (new fields, renamed fields, restructured stores),
 * old projects saved in IndexedDB or .kh files are automatically migrated to the latest schema.
 *
 * Migrations run in loadProject() before deserialize(), and in importProject() after parsing.
 */

import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { PROJECT_CONST } from '../constants';

export interface SchemaMigration {
  from: string;
  to: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

/** Ordered list of migrations. Each runs sequentially when needed. */
const migrations: SchemaMigration[] = [
  // Migrations will be added here as the schema evolves.
  // Example:
  // { from: '3.0.0', to: '3.1.0', migrate: v3_0_to_v3_1 }
];

/**
 * Run all applicable migrations on a serialized project.
 * Returns the migrated data with the current schema version stamped.
 */
export function migrateIfNeeded(
  data: Record<string, unknown>
): Record<string, unknown> {
  const manifest = data.manifest as
    | { version?: string; [k: string]: unknown }
    | undefined;
  let currentVersion = manifest?.version ?? '3.0.0';
  let migrated = data;

  for (const migration of migrations) {
    if (currentVersion === migration.from) {
      try {
        migrated = migration.migrate(migrated);
        currentVersion = migration.to;
        logger.info(
          `Project schema migrated ${migration.from} → ${migration.to}`,
          LogCategory.PERSISTENCE
        );
      } catch (error) {
        logger.error(
          `Schema migration ${migration.from} → ${migration.to} failed`,
          LogCategory.PERSISTENCE,
          error
        );
        break;
      }
    }
  }

  if (manifest) {
    manifest.version = PROJECT_CONST.APP_VERSION;
  }

  return migrated;
}
