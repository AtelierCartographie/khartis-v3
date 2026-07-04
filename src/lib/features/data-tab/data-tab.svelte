<script lang="ts">
  import BasemapJoinStep from './components/basemap-join-step.svelte';
  import DataControlStep from './components/data-control-step.svelte';
  import { dataTabStore } from './stores/data-tab.store.svelte';
  import EnrichDataStep from './components/enrich-data-step.svelte';
  import GeolocationStep from './components/geolocation-step.svelte';
  import { ToolbarTabLayout } from '$lib/features/main-toolbar';

  const isGeographicMode = $derived(dataTabStore.isGeographicMode);

  $effect(() => {
    void dataTabStore.hasCompletedStep;
    void dataTabStore.activeStepIndex;
    void isGeographicMode;
    dataTabStore.updateNavigationPermissions();
  });
</script>

<ToolbarTabLayout id="khartis-data-tab">
  <DataControlStep />

  {#if isGeographicMode}
    <EnrichDataStep />
  {:else}
    <GeolocationStep />
    <BasemapJoinStep />
  {/if}
</ToolbarTabLayout>
