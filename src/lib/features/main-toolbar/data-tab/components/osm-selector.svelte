<script lang="ts">
  import { resolve } from '$app/paths';
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import * as m from '$lib/paraglide/messages';
  import { InlineNotification } from 'carbon-components-svelte';

  interface Props {
    isActive?: boolean;
    hasGPSCoordinates?: boolean;
    onSelectOSM: () => void;
    onGoToVisualize?: () => void;
  }

  const {
    isActive = false,
    hasGPSCoordinates = true,
    onSelectOSM,
    onGoToVisualize
  }: Props = $props();

  function handleLinkClick(event: Event): void {
    event.preventDefault();
    onGoToVisualize?.();
  }
</script>

<div class="osm-selector">
  <h4 class="osm-title">{m.osm_modal_title()}</h4>
  <p class="section-description">{m.osm_modal_description()}</p>

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
    {#if onGoToVisualize}
      <p class="osm-note">
        {m.osm_customization_note()}
        <a href={resolve('/')} class="bx--link" onclick={handleLinkClick}>
          {m.step_visualize()}
        </a>.
      </p>
    {:else}
      <p class="osm-note">{m.osm_customization_note()}</p>
    {/if}
  {:else}
    <div class="osm-action">
      <Button kind="primary" on:click={onSelectOSM}>
        {m.osm_modal_button_add()}
      </Button>
    </div>
    {#if onGoToVisualize}
      <p class="osm-note">
        {m.osm_customization_note()}
        <a href={resolve('/')} class="bx--link" onclick={handleLinkClick}>
          {m.step_visualize()}
        </a>.
      </p>
    {:else}
      <p class="osm-note">{m.osm_customization_note()}</p>
    {/if}
  {/if}
</div>

<style>
  .osm-selector {
    padding-top: var(--cds-spacing-04);
  }

  .osm-title {
    margin: 0 0 var(--cds-spacing-03) 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .section-description {
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-04);
  }

  .osm-action {
    margin: var(--cds-spacing-04) 0;
  }

  .osm-note {
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    margin: var(--cds-spacing-04) 0;
  }
</style>
