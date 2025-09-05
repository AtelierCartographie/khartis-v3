<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages.js';
  import {
    Button,
    Column,
    Grid,
    NumberInput,
    RadioButton,
    RadioButtonGroup,
    Row,
    Select,
    SelectItem,
    Slider
  } from 'carbon-components-svelte';
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from './geo-indications.store.svelte';

  const store = geoIndicationsActions;
  const state = $derived(geoIndicationsState);

  const styleOptions = [
    { value: 'line', text: m.geo_line_style() },
    { value: 'dashed', text: m.geo_dashed_style() },
    { value: 'dotted', text: m.geo_dotted_style() }
  ];

  const scaleHex = $derived(
    hslToHex(
      state.scale.color.hue,
      state.scale.color.saturation,
      state.scale.color.lightness
    )
  );
  const orientationHex = $derived(
    hslToHex(
      state.orientation.color.hue,
      state.orientation.color.saturation,
      state.orientation.color.lightness
    )
  );
  const insetMapWindowHex = $derived(
    hslToHex(
      state.insetMap.windowColor.hue,
      state.insetMap.windowColor.saturation,
      state.insetMap.windowColor.lightness
    )
  );

  type ColorPickerValidateEvent = {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  };
</script>

<div id="khartis-geo-indications-tool">
  <div class="expandable-stack">
    <ExpandableSection
      title={m.geo_scale()}
      defaultOpen={state.scale.expanded}
      showToggle={true}
      toggleChecked={state.scale.enabled}
      onToggleChange={() => store.toggleScale()}
    >
      {#snippet children()}
        <Grid padding noGutter>
          <Row>
            <Column>
              <Select
                id="style-select"
                labelText={m.geo_style()}
                selected={state.scale.style}
                on:change={(e) =>
                  store.setScaleStyle((e as CustomEvent).detail)}
                size="xl"
              >
                {#each styleOptions as option}
                  <SelectItem value={option.value} text={option.text} />
                {/each}
              </Select>
            </Column>
          </Row>

          <Row>
            <Column sm={3} md={6} lg={13}>
              <div class="distance-controls">
                <NumberInput
                  id="distance-input"
                  label={m.geo_distance()}
                  value={state.scale.distance}
                  on:change={(e) =>
                    store.setScaleDistance((e as CustomEvent).detail || 0)}
                  min={0}
                  hideSteppers
                  size="xl"
                />
              </div>
            </Column>

            <Column sm={1} md={2} lg={3}>
              <div class="distance-buttons">
                <Button
                  kind="ghost"
                  size="small"
                  on:click={() => store.decrementScaleDistance()}
                  class="distance-button"
                >
                  −
                </Button>
                <Button
                  kind="ghost"
                  size="small"
                  on:click={() => store.incrementScaleDistance()}
                  class="distance-button"
                >
                  +
                </Button>
              </div>
            </Column>
          </Row>

          <Row>
            <Column>
              <RadioButtonGroup
                legendText={m.geo_units()}
                selected={state.scale.units}
                on:change={(e) =>
                  store.setScaleUnits((e as CustomEvent).detail)}
              >
                <RadioButton
                  id="kilometers"
                  value="kilometers"
                  labelText={m.geo_kilometers()}
                />
                <RadioButton
                  id="miles"
                  value="miles"
                  labelText={m.geo_miles()}
                />
              </RadioButtonGroup>
            </Column>
          </Row>

          <Row>
            <Column>
              <ColorPicker
                triggerLabel={m.geo_color()}
                hex={scaleHex}
                hue={state.scale.color.hue}
                saturation={state.scale.color.saturation}
                lightness={state.scale.color.lightness}
                onValidate={({
                  hue,
                  saturation,
                  lightness
                }: ColorPickerValidateEvent) => {
                  store.setScaleColor({ hue, saturation, lightness });
                }}
              />
            </Column>
          </Row>
        </Grid>
      {/snippet}
    </ExpandableSection>

    <ExpandableSection
      title={m.geo_orientation()}
      defaultOpen={false}
      showToggle={true}
      toggleChecked={state.orientation.enabled}
      onToggleChange={() => store.toggleOrientation()}
    >
      {#snippet children()}
        <Grid padding noGutter>
          <Row>
            <Column>
              <RadioButtonGroup
                legendText={m.geo_orientation_style()}
                selected={state.orientation.style}
                on:change={(e) =>
                  store.setOrientationStyle((e as CustomEvent).detail)}
              >
                <RadioButton
                  id="arrow-style"
                  value="arrow"
                  labelText={m.geo_orientation_arrow()}
                />
                <RadioButton
                  id="compass-style"
                  value="compass"
                  labelText={m.geo_orientation_compass()}
                />
              </RadioButtonGroup>
            </Column>
          </Row>

          <Row>
            <Column sm={3} md={6} lg={13}>
              <div class="slider">
                <Slider
                  labelText={m.geo_orientation_size()}
                  min={5}
                  max={30}
                  step={1}
                  value={state.orientation.size}
                  on:change={(e) =>
                    store.setOrientationSize((e as CustomEvent).detail.value)}
                  hideTextInput
                />
              </div>
            </Column>

            <Column sm={1} md={2} lg={3}>
              <div class="input-wrapper">
                <input
                  id="orientation-size"
                  class="number"
                  type="number"
                  min={5}
                  max={30}
                  step={1}
                  value={state.orientation.size}
                  oninput={(e) =>
                    store.setOrientationSize(
                      parseInt((e.target as HTMLInputElement).value) || 10
                    )}
                  inputmode="numeric"
                />
              </div>
            </Column>
          </Row>

          <Row>
            <Column>
              <ColorPicker
                triggerLabel={m.geo_orientation_color()}
                hex={orientationHex}
                hue={state.orientation.color.hue}
                saturation={state.orientation.color.saturation}
                lightness={state.orientation.color.lightness}
                onValidate={({
                  hue,
                  saturation,
                  lightness
                }: ColorPickerValidateEvent) => {
                  store.setOrientationColor({ hue, saturation, lightness });
                }}
              />
            </Column>
          </Row>
        </Grid>
      {/snippet}
    </ExpandableSection>

    <ExpandableSection
      title={m.geo_inset_map()}
      defaultOpen={false}
      showToggle={true}
      toggleChecked={state.insetMap.enabled}
      onToggleChange={() => store.toggleInsetMap()}
    >
      {#snippet children()}
        <Grid padding noGutter>
          <Row>
            <Column>
              <RadioButtonGroup
                legendText={m.geo_inset_map_type()}
                selected={state.insetMap.type}
                on:change={(e) =>
                  store.setInsetMapType((e as CustomEvent).detail)}
              >
                <RadioButton
                  id="globe-type"
                  value="globe"
                  labelText={m.geo_inset_map_globe()}
                />
                <RadioButton
                  id="planisphere-type"
                  value="planisphere"
                  labelText={m.geo_inset_map_planisphere()}
                />
              </RadioButtonGroup>
            </Column>
          </Row>

          <Row>
            <Column sm={3} md={6} lg={13}>
              <div class="slider">
                <Slider
                  labelText={m.geo_inset_map_size()}
                  min={20}
                  max={210}
                  step={1}
                  value={state.insetMap.size}
                  on:change={(e) =>
                    store.setInsetMapSize((e as CustomEvent).detail.value)}
                  hideTextInput
                />
              </div>
            </Column>

            <Column sm={1} md={2} lg={3}>
              <div class="input-wrapper">
                <input
                  id="inset-map-size"
                  class="number"
                  type="number"
                  min={20}
                  max={210}
                  step={1}
                  value={state.insetMap.size}
                  oninput={(e) =>
                    store.setInsetMapSize(
                      parseInt((e.target as HTMLInputElement).value) || 40
                    )}
                  inputmode="numeric"
                />
              </div>
            </Column>
          </Row>

          <Row>
            <Column>
              <ColorPicker
                triggerLabel={m.geo_inset_map_window_color()}
                hex={insetMapWindowHex}
                hue={state.insetMap.windowColor.hue}
                saturation={state.insetMap.windowColor.saturation}
                lightness={state.insetMap.windowColor.lightness}
                onValidate={({
                  hue,
                  saturation,
                  lightness
                }: ColorPickerValidateEvent) => {
                  store.setInsetMapWindowColor({ hue, saturation, lightness });
                }}
              />
            </Column>
          </Row>

          <Row>
            <Column sm={3} md={6} lg={13}>
              <div class="slider">
                <Slider
                  labelText={m.geo_inset_map_zoom()}
                  min={0}
                  max={100}
                  step={1}
                  value={state.insetMap.zoom}
                  on:change={(e) =>
                    store.setInsetMapZoom((e as CustomEvent).detail.value)}
                  hideTextInput
                />
              </div>
            </Column>

            <Column sm={1} md={2} lg={3}>
              <div class="input-wrapper">
                <input
                  id="inset-map-zoom"
                  class="number"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={state.insetMap.zoom}
                  oninput={(e) =>
                    store.setInsetMapZoom(
                      parseInt((e.target as HTMLInputElement).value) || 50
                    )}
                  inputmode="numeric"
                />
              </div>
            </Column>
          </Row>

          <Row>
            <Column sm={3} md={6} lg={13}>
              <div class="slider">
                <Slider
                  labelText={m.geo_inset_map_contrast()}
                  min={0}
                  max={100}
                  step={1}
                  value={state.insetMap.contrast}
                  on:change={(e) =>
                    store.setInsetMapContrast((e as CustomEvent).detail.value)}
                  hideTextInput
                />
              </div>
            </Column>

            <Column sm={1} md={2} lg={3}>
              <div class="input-wrapper">
                <input
                  id="inset-map-contrast"
                  class="number"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={state.insetMap.contrast}
                  oninput={(e) =>
                    store.setInsetMapContrast(
                      parseInt((e.target as HTMLInputElement).value) || 50
                    )}
                  inputmode="numeric"
                />
              </div>
            </Column>
          </Row>
        </Grid>
      {/snippet}
    </ExpandableSection>
  </div>
</div>

<style>
  #khartis-geo-indications-tool .expandable-stack :global(.section-container) {
    margin-bottom: 0;
  }

  #khartis-geo-indications-tool
    .expandable-stack
    :global(.section-container + .section-container) {
    border-top: 0;
  }

  .distance-controls {
    display: flex;
    align-items: flex-end;
    width: 100%;
  }

  .distance-buttons {
    display: flex;
    flex-direction: column;
    margin-left: var(--cds-spacing-02);
    height: 100%;
    align-items: center;
    justify-content: flex-end;
  }

  #khartis-geo-indications-tool :global(.distance-button) {
    height: 1.25rem;
    padding: 0 var(--cds-spacing-02);
    font-size: 0.875rem;
    min-height: unset;
    margin-bottom: 1px;
  }

  #khartis-geo-indications-tool :global(.distance-button:first-child) {
    margin-bottom: 2px;
  }

  .slider {
    width: 100%;
  }

  #khartis-geo-indications-tool .slider :global(.bx--slider) {
    min-width: 200px !important;
  }

  #khartis-geo-indications-tool .slider :global(.bx--slider__track) {
    background: var(--cds-ui-03);
  }

  #khartis-geo-indications-tool .slider :global(.bx--slider__filled-track) {
    background: var(--cds-text-01);
  }

  .input-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }

  .input-wrapper .number {
    width: 100%;
    height: 32px;
    min-width: unset;
    padding: 0 var(--cds-spacing-03);
    border: none;
    border-bottom: 1px solid #000;
    background: var(--cds-ui-02);
    color: var(--cds-text-01);
    font-weight: normal;
    font-family: var(--cds-code-01-font-family);
    line-height: var(--cds-body-short-01-line-height);
    border-radius: 0;
    box-sizing: border-box;
    font-weight: 600;
  }

  .input-wrapper .number:focus {
    outline: none;
    border-bottom-color: #000;
  }

  .input-wrapper .number:disabled {
    background: var(--cds-ui-03);
    color: var(--cds-text-02);
    cursor: not-allowed;
  }

  input[type='number']::-webkit-outer-spin-button,
  input[type='number']::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type='number'] {
    appearance: textfield;
    -moz-appearance: textfield;
  }
</style>
