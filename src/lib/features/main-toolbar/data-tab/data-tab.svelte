<script lang="ts">
  import BasemapJoinStep from './basemap-join-step.svelte';
  import DataControlStep from './data-control-step.svelte';
  import { dataTabStore } from './data-tab.store.svelte';
  import EnrichDataStep from './enrich-data-step.svelte';
  import GeolocationStep from './geolocation-step.svelte';
  import ToolbarTabLayout from '../components/toolbar-tab-layout.svelte';

  const isGeographicMode = $derived(dataTabStore.isGeographicMode);

  $effect(() => {
    void dataTabStore.hasCompletedStep;
    void dataTabStore.activeStepIndex;
    void isGeographicMode;
    dataTabStore.updateNavigationPermissions();
  });
</script>

<ToolbarTabLayout id="khartis-data-tab">
  <!-- Step 1: Control data - Always visible -->
  <DataControlStep />

  {#if isGeographicMode}
    <!-- Geographic workflow: Step 2 is Enrich (optional) -->
    <EnrichDataStep />
  {:else}
    <!-- Tabular workflow: Steps 2 and 3 -->
    <GeolocationStep />
    <BasemapJoinStep />
  {/if}
</ToolbarTabLayout>
