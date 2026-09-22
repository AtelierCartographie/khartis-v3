<script lang="ts">
  import { resolve } from '$app/paths';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import * as m from '$lib/paraglide/messages';
  import { InlineNotification } from 'carbon-components-svelte';

  interface Props {
    isActive: boolean;
    hasGPSCoordinates: boolean;
    onSelectOSM: () => void;
    onGoToVisualize?: () => void;
  }

  const { isActive, hasGPSCoordinates, onSelectOSM, onGoToVisualize }: Props =
    $props();

  function handleLinkClick(event: Event): void {
    event.preventDefault();
    onGoToVisualize?.();
  }
</script>

<div class="osm-basemap-selector">
  <p class="osm-description">{m.osm_description()}</p>

  {#if !hasGPSCoordinates}
    <InlineNotification
      kind="warning"
      title={m.osm_modal_gps_required_title()}
      subtitle={m.osm_modal_gps_required_subtitle()}
      hideCloseButton={true}
      lowContrast
    />
  {:else if isActive}
    <InlineNotification
      kind="success"
      title={m.osm_basemap_title()}
      subtitle={m.osm_basemap_description()}
      hideCloseButton={true}
      lowContrast
    />
  {:else}
    <Button size="field" kind="primary" on:click={onSelectOSM}>
      {m.osm_modal_button_add()}
    </Button>
  {/if}

  <p class="osm-note">
    {m.osm_customization_note()}
    {#if onGoToVisualize}
      <a href={resolve('/')} class="bx--link" onclick={handleLinkClick}>
        {m.step_visualize()}
      </a>.
    {/if}
  </p>
</div>

<style>
  .osm-basemap-selector {
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
