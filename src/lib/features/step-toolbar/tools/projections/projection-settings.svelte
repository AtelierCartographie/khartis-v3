<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    InlineNotification,
    Slider,
    Toggle
  } from 'carbon-components-svelte';
  import { Renew } from 'carbon-icons-svelte';

  let longitude = $state<number>(0);
  let latitude = $state<number>(0);
  let rotation = $state<number>(0);

  let simplifiedPreview = $state<boolean>(true);
  let showInfo = $state<boolean>(true);

  const isDirty = $derived(longitude !== 0 || latitude !== 0 || rotation !== 0);
  const deg = (n: number) => `${n}°`;

  function resetAll() {
    longitude = 0;
    latitude = 0;
    rotation = 0;
  }
</script>

<div id="khartis-projection-settings-tool">
  <div class="projection-settings">
    <div class="controls">
      <Slider
        labelText={m.projection_settings_longitude()}
        bind:value={longitude}
        min={-180}
        max={180}
        step={1}
        minLabel={deg(-180)}
        maxLabel={deg(180)}
        hideTextInput={false}
        fullWidth
      />

      <Slider
        labelText={m.projection_settings_latitude()}
        bind:value={latitude}
        min={-90}
        max={90}
        step={1}
        minLabel={deg(-90)}
        maxLabel={deg(90)}
        hideTextInput={false}
        fullWidth
      />

      <Slider
        labelText={m.projection_settings_rotation()}
        bind:value={rotation}
        min={-180}
        max={180}
        step={1}
        minLabel={deg(-180)}
        maxLabel={deg(180)}
        hideTextInput={false}
        fullWidth
      />

      <div class="toggle-row">
        <Toggle
          labelText={m.projection_settings_simplified_preview()}
          labelA={m.projection_settings_no()}
          labelB={m.projection_settings_yes()}
          bind:toggled={simplifiedPreview}
          size="sm"
        />
      </div>

      {#if simplifiedPreview && showInfo}
        <InlineNotification
          kind="info"
          title={m.projection_settings_info_title()}
          subtitle={m.projection_settings_info_subtitle()}
          lowContrast
          on:close={() => (showInfo = false)}
        />
      {/if}
    </div>

    <div class="footer">
      <Button class="reset" disabled={!isDirty} icon={Renew} on:click={resetAll}
        >{m.projection_settings_reset()}</Button
      >
    </div>
  </div>
</div>

<style lang="scss">
  .projection-settings {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-06);
    padding: var(--cds-spacing-05);
    width: 100%;
    box-sizing: border-box;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-06);
  }

  #khartis-projection-settings-tool :global(.controls .bx--slider-container) {
    width: 100%;
  }

  #khartis-projection-settings-tool :global(.controls .bx--slider) {
    min-width: auto !important;
    max-width: none !important;
    flex: 1;
    margin: 0 0.5rem;
  }

  #khartis-projection-settings-tool :global(.controls .bx--slider-text-input) {
    width: 3.5rem !important;
    min-width: 3.5rem !important;
    flex-shrink: 0;
    text-align: center;
  }

  #khartis-projection-settings-tool
    :global(.controls .bx--slider__range-label) {
    min-width: 2rem;
    font-size: 0.75rem;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    margin-top: var(--cds-spacing-03);
  }

  .footer {
    display: flex;
  }

  #khartis-projection-settings-tool :global(.reset) {
    width: 100%;
  }
</style>
