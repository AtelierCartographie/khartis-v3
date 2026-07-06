import type { ProjectionState } from '../../types/projections.types';
import type { ProjectionSuggestion } from './projection-suggest.service';

type ProjectionSuggestionOrientationState = Pick<
  ProjectionState,
  'center' | 'longitude' | 'latitude' | 'rotation'
>;

const ORIENTATION_EPSILON = 1e-6;

function areNumbersClose(left: number, right: number): boolean {
  return Math.abs(left - right) <= ORIENTATION_EPSILON;
}

function resolveCurrentCenter(
  state: ProjectionSuggestionOrientationState
): [number, number] {
  return state.center ?? [state.longitude, state.latitude];
}

function resolveSuggestionDefaultCenter(
  suggestion: ProjectionSuggestion
): [number, number] {
  const rotate = suggestion.d3Config?.rotate;
  return [-(rotate?.[0] ?? 0), -(rotate?.[1] ?? 0)];
}

export function isProjectionSuggestionOrientationDefault(
  state: ProjectionSuggestionOrientationState,
  suggestion: ProjectionSuggestion
): boolean {
  const [longitude, latitude] = resolveCurrentCenter(state);
  const [expectedLongitude, expectedLatitude] =
    resolveSuggestionDefaultCenter(suggestion);

  return (
    areNumbersClose(state.rotation, 0) &&
    areNumbersClose(longitude, expectedLongitude) &&
    areNumbersClose(latitude, expectedLatitude)
  );
}
