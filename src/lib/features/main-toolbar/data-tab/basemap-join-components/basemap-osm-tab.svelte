<script lang="ts">
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Button, InlineNotification, Link } from 'carbon-components-svelte';

  interface Props {
    hasGPSCoordinates: boolean;
    onSelectOSM: () => void;
    onGoToVisualize: () => void;
  }

  let { hasGPSCoordinates, onSelectOSM, onGoToVisualize }: Props = $props();

  function handleLinkClick(event: Event): void {
    event.preventDefault();
    onGoToVisualize();
  }
</script>

<div class="tab-content">
  <p class="osm-description">
    {m.osm_description()}
  </p>

  {#if !hasGPSCoordinates}
    <InlineNotification
      kind="warning"
      title={m.osm_modal_gps_required_title()}
      subtitle={m.osm_modal_gps_required_subtitle()}
      hideCloseButton={true}
      lowContrast
    />
  {:else if osmBasemapStore.isActive}
    <InlineNotification
      kind="success"
      title={m.osm_basemap_title()}
      subtitle={m.osm_basemap_description()}
      hideCloseButton={true}
      lowContrast
    />
  {:else}
    <Button kind="primary" on:click={onSelectOSM}>
      {m.osm_modal_button_add()}
    </Button>
  {/if}

  <p class="osm-note">
    {m.osm_customization_note()}
    <Link inline href="#" on:click={handleLinkClick}>
      {m.step_visualize()}
    </Link>.
  </p>
</div>

<style>
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .osm-description {
    color: var(--cds-text-02, #525252);
    font-size: 0.875rem;
    line-height: 1.375rem;
    margin: 0;
  }

  .osm-note {
    color: var(--cds-text-02, #525252);
    font-size: 0.875rem;
    line-height: 1.375rem;
    margin: 0;
  }
</style>
