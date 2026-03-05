<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import { Select, SelectItem } from 'carbon-components-svelte';
  import {
    colorBlindnessActions,
    getColorBlindnessState
  } from './color-blindness.store.svelte';
  import type { ColorBlindnessState } from './color-blindness.types';

  const colorBlindnessState = $derived(getColorBlindnessState());

  const simulationOptions = [
    { value: 'none', text: m.colorblind_none() },
    { value: 'protanopia', text: m.colorblind_protanopia() },
    { value: 'deuteranopia', text: m.colorblind_deuteranopia() },
    { value: 'tritanopia', text: m.colorblind_tritanopia() },
    { value: 'protanomaly', text: m.colorblind_protanomaly() },
    { value: 'deuteranomaly', text: m.colorblind_deuteranomaly() },
    { value: 'tritanomaly', text: m.colorblind_tritanomaly() },
    { value: 'achromatopsia', text: m.colorblind_achromatopsia() },
    { value: 'achromatomaly', text: m.colorblind_achromatomaly() }
  ];

  function handleSimulationChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    colorBlindnessActions.setSimulationType(
      selectElement.value as ColorBlindnessState['simulationType']
    );
  }
</script>

<div id="khartis-color-blindness-tool">
  <Select
    id="simulation-select"
    labelText={m.colorblind_simulation()}
    selected={colorBlindnessState.simulationType}
    on:change={handleSimulationChange}
    size="xl"
  >
    {#each simulationOptions as option (option.value)}
      <SelectItem value={option.value} text={option.text} />
    {/each}
  </Select>
  <p class="helper-text">{m.colorblind_helper()}</p>
</div>

<style>
  .helper-text {
    margin-top: var(--cds-spacing-03);
    font-size: var(--cds-helper-text-01-font-size, 0.75rem);
    line-height: var(--cds-helper-text-01-line-height, 1rem);
    color: var(--cds-text-helper, #6f6f6f);
    letter-spacing: var(--cds-helper-text-01-letter-spacing, 0.32px);
  }
</style>
