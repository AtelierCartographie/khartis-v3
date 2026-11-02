<script lang="ts">
  import BasemapJoinStep from './components/basemap-join-step.svelte';
  import AttachedTableStep from './components/attached-table-step.svelte';
  import DataControlStep from './components/data-control-step.svelte';
  import { dataTabStore } from './stores/data-tab.store.svelte';
  import EnrichDataStep from './components/enrich-data-step.svelte';
  import GeolocationStep from './components/geolocation-step.svelte';
  import { ToolbarTabLayout } from '$lib/features/main-toolbar';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import { projectStore } from '$lib/features/commons/stores/project.store.svelte';
  import {
    findAttachedDataset,
    findDatasetAttachment
  } from '$lib/features/commons/utils/dataset-attachment.utils';
  import { openDatasetTab } from './services/dataset-navigation.service';

  const isGeographicMode = $derived(dataTabStore.isGeographicMode);
  // A table joined into a geo file is part of it: it is no longer geolocated
  // or joined on its own.
  const attachment = $derived(
    findDatasetAttachment(
      projectStore.currentProject?.data?.sourceFiles,
      datasetsStore.selectedDataset
    )
  );
  const attachedGeoDataset = $derived(
    findAttachedDataset(datasetsStore.datasets, attachment)
  );

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
  {:else if attachment}
    <AttachedTableStep
      attachment={attachment}
      geoDatasetId={attachedGeoDataset?.id}
      onOpenGeoDataset={openDatasetTab}
    />
  {:else}
    <GeolocationStep />
    <BasemapJoinStep />
  {/if}
</ToolbarTabLayout>
