<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { RadioButtonGroup, RadioButton } from 'carbon-components-svelte';
  import { basemapStyleStore } from '$lib/features/commons/store/basemap-style.store.svelte';
  import { projectStore } from '$lib/features/commons/store/project.store.svelte';
  import { BasemapStyle } from '$lib/features/map/constants/basemap-styles';

  const tiledBasemapOptions = [
    {
      value: BasemapStyle.CARTE_FACILE_DESATURATED,
      label: m.basemap_desaturated()
    },
    {
      value: BasemapStyle.CARTE_FACILE_SIMPLE,
      label: m.basemap_simple()
    },
    {
      value: BasemapStyle.CARTE_FACILE_AERIAL,
      label: m.basemap_aerial()
    }
  ];

  let selectedStyle = $state<BasemapStyle>(
    basemapStyleStore.selectedStyle !== BasemapStyle.BLANK_WHITE
      ? basemapStyleStore.selectedStyle
      : BasemapStyle.CARTE_FACILE_DESATURATED
  );

  async function handleStyleChange(value: BasemapStyle): Promise<void> {
    selectedStyle = value;
    basemapStyleStore.setStyle(value);
    if (projectStore.currentProject) {
      await projectStore.saveCurrentProject();
    }
  }
</script>

<div class="basemap-style-selector">
  <RadioButtonGroup
    legendText={m.basemap_style_label()}
    selected={selectedStyle}
    on:change={(e) => handleStyleChange(e.detail as BasemapStyle)}
  >
    {#each tiledBasemapOptions as option (option.value)}
      <RadioButton labelText={option.label} value={option.value} />
    {/each}
  </RadioButtonGroup>
</div>

<style>
  .basemap-style-selector :global(.cds--radio-button-group) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }
</style>
