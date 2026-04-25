import type { ProjectionLike } from 'geoarrow-deck-stream';

/**
 * Manual projection tool choices override catalog metadata when allowed.
 * Automatic suggestions only fill the gap when no catalog projection exists.
 */
export function resolveProjectionForRender(
  defaultProjection: ProjectionLike | undefined,
  userOverride: ProjectionLike | undefined,
  overrideSource?: 'auto' | 'manual',
  allowManualOverride = true
): ProjectionLike | undefined {
  if (overrideSource === 'manual' && userOverride) {
    return allowManualOverride ? userOverride : defaultProjection;
  }

  if (defaultProjection) {
    return defaultProjection;
  }

  return userOverride;
}
