import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';

export function resolveProjectionForRender(
  defaultProjection: ProjectionLike | undefined,
  userOverride: ProjectionLike | undefined,
  overrideSource?: 'auto' | 'manual',
  allowManualOverride = true
): ProjectionLike | undefined {
  if (overrideSource === 'manual' && userOverride) {
    return allowManualOverride ? userOverride : defaultProjection;
  }

  return defaultProjection;
}
