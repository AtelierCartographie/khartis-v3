/**
 * Schema migration system for project persistence.
 *
 * When the serialized project format evolves (new fields, renamed fields, restructured stores),
 * old projects saved in IndexedDB or .kh files are automatically migrated to the latest schema.
 *
 * Migrations run in loadProject() before deserialize(), and in importProject() after parsing.
 */

import { PROJECT_CONST } from '../constants';

export interface SchemaMigration {
  from: string;
  to: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Recursively remap legacy `type: 'point'` values on `symbols` blocks to the
 * new `'circle'` canonical value after the `ShapeType.POINT` → `ShapeType.CIRCLE`
 * rename in issue #92.
 */
function remapLegacyPointShape(
  data: Record<string, unknown>
): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }
    if (node && typeof node === 'object') {
      const clone: Record<string, unknown> = {
        ...(node as Record<string, unknown>)
      };
      const symbols = clone.symbols;
      if (
        symbols &&
        typeof symbols === 'object' &&
        !Array.isArray(symbols) &&
        (symbols as Record<string, unknown>).type === 'point'
      ) {
        clone.symbols = {
          ...(symbols as Record<string, unknown>),
          type: 'circle'
        };
      }
      for (const key of Object.keys(clone)) {
        if (key === 'symbols') continue;
        clone[key] = walk(clone[key]);
      }
      return clone;
    }
    return node;
  };

  return walk(data) as Record<string, unknown>;
}

/** Ordered list of migrations. Each runs sequentially when needed. */
const migrations: SchemaMigration[] = [
  // Chain both 3.0.0 and 3.1.0 through the point→circle remap; the function is
  // idempotent so re-running it on an already-migrated project is a no-op.
  { from: '3.0.0', to: '3.1.0', migrate: remapLegacyPointShape },
  { from: '3.1.0', to: '3.2.0', migrate: remapLegacyPointShape }
];

/**
 * Run all applicable migrations on a serialized project.
 * Returns the migrated data with the current schema version stamped.
 * The version is stamped on the returned (possibly cloned) manifest, not the
 * input, because migrations deep-clone their payload.
 */
export function migrateIfNeeded(
  data: Record<string, unknown>
): Record<string, unknown> {
  const inputManifest = data.manifest as
    | { version?: string; [k: string]: unknown }
    | undefined;
  let currentVersion = inputManifest?.version ?? '3.0.0';
  let migrated = data;

  for (const migration of migrations) {
    if (currentVersion === migration.from) {
      try {
        migrated = migration.migrate(migrated);
        currentVersion = migration.to;
      } catch (error) {
        throw new Error(
          `Schema migration ${migration.from} → ${migration.to} failed`,
          {
            cause: error
          }
        );
      }
    }
  }

  const outputManifest = migrated.manifest as
    | { version?: string; [k: string]: unknown }
    | undefined;
  if (outputManifest) {
    outputManifest.version = PROJECT_CONST.APP_VERSION;
  }

  return migrated;
}
