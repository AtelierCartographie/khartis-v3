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
  <!-- Description -->
  <p class="osm-description">
    {m.osm_description()}
  </p>

  <!-- Conditional: GPS warning / Success / Add button -->
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
      subtitle={m.osm_basemap_description()}
      hideCloseButton={true}
      lowContrast
    />
  {:else}
    <Button kind="primary" on:click={onSelectOSM}>
      {m.osm_modal_button_add()}
    </Button>
  {/if}

  <!-- Customization note (always visible) -->
  <p class="osm-note">
    {m.osm_customization_note()}
    <button type="button" class="link-text" onclick={onGoToVisualize}
      >{m.step_visualize()}</button
    >.
  </p>

  <!-- Learn more -->
  <div class="learn-more-link">
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

  .learn-more-link :global(.bx--btn--ghost) {
    color: var(--cds-text-helper, #6f6f6f);
    font-size: 0.75rem;
  }

  .learn-more-link :global(.bx--btn--ghost:hover) {
    color: var(--cds-text-02, #525252);
  }

  .learn-more-link :global(.bx--btn--ghost svg) {
    fill: var(--cds-text-helper, #6f6f6f);
  }
</style>
