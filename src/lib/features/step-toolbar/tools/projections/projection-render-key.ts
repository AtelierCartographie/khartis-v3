import type { ProjectionState } from './projections.types';

/**
 * Stable key for layer refreshes driven by the Projection tool.
 * It intentionally ignores suggestion payloads and UI-only state.
 */
export function buildProjectionRenderKey(state: ProjectionState): string {
  return [
    state.selected,
    state.customCode ?? '',
    state.overrideActive ? 'override' : 'default'
  ].join('|');
}
