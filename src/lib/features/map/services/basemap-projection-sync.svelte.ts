import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { projectionActions } from '$lib/features/step-toolbar/tools/projections/projection.store.svelte';

$effect.root(() => {
  $effect(() => {
    const id = basemapStyleStore.referenceBasemapId;
    if (!id) return;
    projectionActions.applyBasemapPreferredProjection();
  });
});
