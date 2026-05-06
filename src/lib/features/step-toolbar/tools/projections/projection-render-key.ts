import type { ProjectionState } from '../../types/projections.types';

/**
 * Stable key for layer refreshes driven by the Projection tool.
 * It intentionally ignores suggestion payloads and UI-only state.
 */
export function buildProjectionRenderKey(state: ProjectionState): string {
  const center = state.center
    ? `${state.center[0]},${state.center[1]}`
    : `${state.longitude ?? 0},${state.latitude ?? 0}`;
  return [
    state.selected,
    state.customCode ?? '',
    JSON.stringify(state.suggestionD3Config ?? null),
    state.overrideActive ? 'override' : 'default',
    state.overrideSource ?? 'none',
    center,
    state.rotation ?? 0
  ].join('|');
}
