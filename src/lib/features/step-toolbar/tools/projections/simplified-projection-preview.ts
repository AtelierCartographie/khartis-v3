import type { ProjectionState } from '../../types/projections.types';

export function computeSimplifiedProjectionPreview(
  isOrthographicMode: boolean,
  state: ProjectionState
): boolean {
  if (!isOrthographicMode) {
    return false;
  }
  const hasManualOverride =
    state.overrideActive === true && state.overrideSource === 'manual';
  return hasManualOverride && state.simplifiedPreview === true;
}
