import { facetsStore } from './facets.store.svelte';

export function getFacetsBaseVisualizationId(): string | null {
  return facetsStore.baseVisualizationId;
}

export function disableFacets(): void {
  facetsStore.disable();
}
