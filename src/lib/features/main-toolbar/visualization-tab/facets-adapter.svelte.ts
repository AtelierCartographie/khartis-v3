import { facetsStore as stepToolbarFacetsStore } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';

export { FACET_SLOT, type FacetSlotPath } from './facets-contract';

export const facetsStore = stepToolbarFacetsStore;
