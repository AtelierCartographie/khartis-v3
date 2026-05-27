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
  const hasManualParameters =
    (state.longitude ?? 0) !== 0 ||
    (state.latitude ?? 0) !== 0 ||
    (state.rotation ?? 0) !== 0;
  return (
    hasManualOverride &&
    hasManualParameters &&
    (state.simplifiedPreview ?? true)
  );
}
