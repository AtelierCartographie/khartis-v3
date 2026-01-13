<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { RadioButtonGroup, RadioButton } from 'carbon-components-svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';

  const basemapOptions = [
    {
      value: BasemapStyle.CARTE_FACILE_DESATURATED,
      label: m.basemap_desaturated(),
      description: m.basemap_desaturated_desc()
    },
    {
      value: BasemapStyle.CARTE_FACILE_SIMPLE,
      label: m.basemap_simple(),
      description: m.basemap_simple_desc()
    },
    {
      value: BasemapStyle.CARTE_FACILE_AERIAL,
      label: m.basemap_aerial(),
      description: m.basemap_aerial_desc()
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
