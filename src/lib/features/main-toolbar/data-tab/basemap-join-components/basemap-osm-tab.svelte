<script lang="ts">
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Button, InlineNotification } from 'carbon-components-svelte';
  import { Launch } from 'carbon-icons-svelte';

  interface Props {
    hasGPSCoordinates: boolean;
    onSelectOSM: () => void;
    onGoToVisualize: () => void;
  }

  let { hasGPSCoordinates, onSelectOSM, onGoToVisualize }: Props = $props();
</script>

<div class="tab-content">
  <h4 class="osm-title">{m.osm_modal_title()}</h4>

  <p class="kh-help osm-description">
    {m.osm_modal_description()}
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
      title={m.osm_basemap_title({ style: 'OpenStreetMap' })}
      subtitle={m.osm_modal_description()}
      hideCloseButton={true}
      lowContrast
    />
    <p class="kh-note">
      {m.osm_customization_note()}
      <button type="button" class="link-text" onclick={onGoToVisualize}
        >{m.step_visualize()}</button
      >.
    </p>
  {:else}
    <div class="osm-action">
      <Button kind="primary" on:click={onSelectOSM}>
        {m.osm_modal_button_add()}
      </Button>
    </div>
    <p class="kh-note osm-note">
      {m.osm_customization_note()}
      <button type="button" class="link-text" onclick={onGoToVisualize}
        >{m.step_visualize()}</button
      >.
    </p>
  {/if}

  <Button
    kind="ghost"
    icon={Launch}
    iconDescription={m.learn_more()}
    href="https://www.sciencespo.fr/cartographie/khartis/docs/data"
    target="_blank"
    size="small"
  >
    {m.osm_learn_more()}
  </Button>
</div>

<style>
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .osm-title {
    margin: 0 0 var(--cds-spacing-03) 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
  }

  .osm-description {
    margin-bottom: var(--cds-spacing-04);
  }

  .kh-note {
    color: var(--cds-text-02);
    font-size: 0.875rem;
    margin-bottom: var(--cds-spacing-05);
  }

  .osm-note {
    margin-top: var(--cds-spacing-04);
  }

  .link-text {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--cds-text-01);
    text-decoration: underline;
    cursor: pointer;
  }

  .link-text:hover {
    color: var(--cds-link-primary-hover);
  }

  .osm-action {
    display: flex;
    justify-content: flex-start;
    margin-bottom: var(--cds-spacing-05);
  }
</style>
