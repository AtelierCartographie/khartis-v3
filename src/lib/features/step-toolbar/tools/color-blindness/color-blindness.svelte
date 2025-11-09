<script lang="ts">
  import { m } from '$lib/paraglide/messages.js';
  import {
    Column,
    Grid,
    Row,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import {
    colorBlindnessActions,
    getColorBlindnessState
  } from './color-blindness.store.svelte';
  import type { ColorBlindnessState } from './color-blindness.types';

  const store = colorBlindnessActions;
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
    store.setSimulationType(
      selectElement.value as ColorBlindnessState['simulationType']
    );
  }
</script>

<div id="khartis-color-blindness-tool">
  <Grid noGutter fullWidth>
    <Row>
      <Column>
        <div class="simulation-section">
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
        </div>
      </Column>
    </Row>
  </Grid>
</div>

<style>
  .simulation-section {
    margin-bottom: var(--cds-spacing-04);
  }
</style>
