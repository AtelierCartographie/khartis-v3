<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { RadioButtonGroup, RadioButton } from 'carbon-components-svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';

  const basemapOptions = [
    {
      value: BasemapStyle.CARTO_POSITRON,
      label: 'Carto Positron',
      description: 'Clean light background'
    },
    {
      value: BasemapStyle.CARTO_DARK_MATTER,
      label: 'Carto Dark Matter',
      description: 'Dark background for contrast'
    },
    {
      value: BasemapStyle.CARTO_VOYAGER,
      label: 'Carto Voyager',
      description: 'Balanced color scheme'
    },
    {
      value: BasemapStyle.OSM_LIBERTY,
      label: 'OSM Liberty',
      description: 'Open source OpenStreetMap'
    }
  ];

  let selectedValue = $state(basemapStyleStore.selectedStyle);

  function handleChange(value: BasemapStyle): void {
    basemapStyleStore.setStyle(value);
    selectedValue = value;
  }
</script>

<div class="basemap-selector">
  <RadioButtonGroup
    legendText={m.customize_basemap()}
    bind:selected={selectedValue}
    on:change={(e) => handleChange(e.detail as BasemapStyle)}
  >
    {#each basemapOptions as option (option.value)}
      <RadioButton labelText={option.label} value={option.value} />
    {/each}
  </RadioButtonGroup>
</div>

<style>
  .basemap-selector {
    padding: var(--cds-spacing-05);
  }

  .basemap-selector :global(.cds--radio-button-group) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }
</style>
