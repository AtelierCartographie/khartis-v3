<script lang="ts">
  import BasemapJoinStep from './basemap-join-step.svelte';
  import DataControlStep from './data-control-step.svelte';
  import { dataTabStore } from './data-tab.store.svelte';
  import EnrichDataStep from './enrich-data-step.svelte';
  import GeolocationStep from './geolocation-step.svelte';
  import ToolbarTabLayout from '../components/toolbar-tab-layout.svelte';

  const isGeographicMode = $derived(dataTabStore.isGeographicMode);
  const isTabularGPSMode = $derived(dataTabStore.isTabularGPSMode);

  $effect(() => {
    void dataTabStore.hasCompletedStep;
    void dataTabStore.activeStepIndex;
    void isGeographicMode;
    void isTabularGPSMode;
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
