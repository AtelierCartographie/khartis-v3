<script lang="ts">
  import { Button, InlineNotification } from 'carbon-components-svelte';
  import { Launch } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';

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
      title={m.osm_basemap_title({ style: 'OpenStreetMap' })}
      subtitle={m.osm_modal_description()}
      hideCloseButton={true}
      lowContrast
    />
    {#if onGoToVisualize}
      <p class="osm-note">
        {m.osm_customization_note()}
        <button type="button" class="link-text" onclick={onGoToVisualize}>
          {m.step_visualize()}
        </button>.
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
        <button type="button" class="link-text" onclick={onGoToVisualize}>
          {m.step_visualize()}
        </button>.
      </p>
    {:else}
      <p class="osm-note">{m.osm_customization_note()}</p>
    {/if}
  {/if}

  <Button
    kind="ghost"
    icon={Launch}
    iconDescription="En savoir plus"
    href="https://www.sciencespo.fr/cartographie/khartis/docs/data"
    target="_blank"
    size="small"
  >
    {m.osm_learn_more()}
  </Button>
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

  .link-text {
    background: none;
    border: none;
    padding: 0;
    color: var(--cds-link-primary);
    text-decoration: underline;
    cursor: pointer;
    font-size: inherit;
  }

  .link-text:hover {
    color: var(--cds-link-primary-hover);
  }
</style>
