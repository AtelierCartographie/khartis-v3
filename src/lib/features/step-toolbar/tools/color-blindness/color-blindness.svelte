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
  <div class="simulation-field">
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
  <div class="helper-section">
    <p class="helper-text">{m.colorblind_helper_p1()}</p>
    <p class="helper-text">{m.colorblind_helper_p2()}</p>
  </div>
</div>

<style>
  #khartis-color-blindness-tool {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .simulation-field {
    width: 100%;
  }

  .simulation-field :global(.bx--form-item) {
    margin-bottom: 0;
  }

  .simulation-field :global(.bx--label) {
    margin-bottom: var(--cds-spacing-03);
    color: var(--cds-text-secondary, #525252);
  }

  .simulation-field :global(.bx--select) {
    width: 100%;
  }

  .simulation-field :global(.bx--select-input__wrapper) {
    background: var(--cds-field-01, #f4f4f4);
  }

  .simulation-field :global(.bx--select-input) {
    min-height: 48px;
    padding: 15px 48px 15px 16px;
    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
    background: var(--cds-field-01, #f4f4f4);
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
  }

  .simulation-field :global(.bx--select__arrow) {
    right: 16px;
    fill: var(--cds-icon-primary, #161616);
  }

  .helper-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    width: 100%;
    padding-top: var(--cds-spacing-02);
    padding-bottom: var(--cds-spacing-03);
  }

  .helper-text {
    margin: 0;
    font-size: var(--cds-helper-text-01-font-size, 0.75rem);
    line-height: var(--cds-helper-text-01-line-height, 1rem);
    color: var(--cds-text-secondary, #525252);
    letter-spacing: var(--cds-helper-text-01-letter-spacing, 0.32px);
  }
</style>
