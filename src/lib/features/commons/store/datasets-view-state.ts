import type { SerializedDatasetsViewState } from '$lib/types/serialization.types';

export function deserializeDatasetsViewState(
  data: unknown
): SerializedDatasetsViewState | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  return data as SerializedDatasetsViewState;
}
