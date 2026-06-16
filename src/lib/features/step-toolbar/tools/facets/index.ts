export {
  MAX_FACETS_COLUMNS,
  MAX_FACETS,
  facetsStore
} from './facets.store.svelte';
export { disableFacets, getFacetsBaseVisualizationId } from './facets-access';
export {
  FACET_SLOT,
  SCALE_MODE
} from '$lib/features/commons/constants/facets.constants';
export type {
  FacetSlotPath,
  ScaleMode
} from '$lib/features/commons/constants/facets.constants';
export type { FacetsState } from './facets.store.svelte';
