import {
  getResolvedCoordinateSystem,
  normalizeProj4CrsCode,
  registerKnownProj4Definitions,
  registerResolvedCoordinateSystem
} from '$lib/features/commons/utils/proj4-crs.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { duckDBOrchestrator } from '$lib/features/duckdb';
import proj4 from 'proj4';

// Bumped when a lookup lands, so names and diagnoses re-derive.
let version = $state(0);
const pending = new Map<string, Promise<void>>();
// A lookup that failed (engine not ready, query error) is not retried in the
// session: re-deriving on the version bump would loop on it.
const failed = new Set<string>();

/** Read in a derivation that names a CRS the catalogue may still resolve. */
export function getCrsCatalogVersion(): number {
  return version;
}

function needsLookup(code: string): boolean {
  registerKnownProj4Definitions();
  return (
    /^[A-Z]+:\d+$/.test(code) &&
    !proj4.defs(code) &&
    !failed.has(code) &&
    getResolvedCoordinateSystem(code) === undefined
  );
}

export function isCoordinateSystemLookupFailed(code: string): boolean {
  return failed.has(normalizeProj4CrsCode(code).toUpperCase());
}

/**
 * Reads a CRS code proj4 does not bundle from the PROJ database of DuckDB.
 * Settles once per code; failures leave the code unknown.
 */
export function resolveCoordinateSystem(rawCode: string): Promise<void> {
  const code = normalizeProj4CrsCode(rawCode).toUpperCase();
  if (!needsLookup(code)) {
    return Promise.resolve();
  }
  const existing = pending.get(code);
  if (existing) {
    return existing;
  }

  const lookup = duckDBOrchestrator
    .lookupCoordinateSystem(code)
    .then((entry) => {
      registerResolvedCoordinateSystem(code, entry);
    })
    .catch((error: unknown) => {
      failed.add(code);
      logger.warn('CRS lookup failed', LogCategory.MAP, { code, error });
    })
    .finally(() => {
      pending.delete(code);
      version += 1;
    });
  pending.set(code, lookup);
  version += 1;
  return lookup;
}
