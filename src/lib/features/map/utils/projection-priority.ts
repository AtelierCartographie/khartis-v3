import type { ProjectionLike } from 'geoarrow-deck-stream';

/**
 * Catalog basemap metadata remains authoritative when present.
 * Projection tool overrides are only a fallback for identity/custom basemaps
 * that do not expose a render projection.
 */
export function resolveProjectionForRender(
  defaultProjection: ProjectionLike | undefined,
  userOverride: ProjectionLike | undefined,
  overrideSource?: 'auto' | 'manual',
  allowManualOverride = true
): ProjectionLike | undefined {
  if (allowManualOverride && overrideSource === 'manual' && userOverride) {
    return userOverride;
  }

  if (defaultProjection) {
    return defaultProjection;
  }

  return allowManualOverride ? userOverride : undefined;
}
