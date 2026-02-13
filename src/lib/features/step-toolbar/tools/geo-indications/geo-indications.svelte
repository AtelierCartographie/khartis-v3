<script lang="ts">
  import { ScaleForm } from '$lib/features/commons/constants/ui.constants';
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
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
  const geoIndicationsVisible = $derived(state.visible);

  const formOptions = [
    { value: ScaleForm.LINE, text: m.geo_scale_form_line() },
    { value: ScaleForm.BOX, text: m.geo_scale_form_box() }
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
  const insetMapContinentHex = $derived(
    hslToHex(
      state.insetMap.continentColor.hue,
      state.insetMap.continentColor.saturation,
      state.insetMap.continentColor.lightness
    )
  );
  const insetMapSeaHex = $derived(
    hslToHex(
      state.insetMap.seaColor.hue,
      state.insetMap.seaColor.saturation,
      state.insetMap.seaColor.lightness
    )
  );

  type ColorPickerValidateEvent = {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  };

  function handleVisibilityChange(visible: boolean): void {
    if (visible !== state.visible) {
      store.setVisibility(visible);
    }
  }

  function handleScaleFormChange(event: Event): void {
    const form = (event.currentTarget as HTMLSelectElement).value as ScaleForm;
    if (form !== state.scale.form) {
      store.setScaleForm(form);
    }
  }

  function getNumericEventValue(event: Event, fallback: number): number {
    const customEvent = event as CustomEvent<unknown>;
    const detail = customEvent.detail;

    if (typeof detail === 'number' && Number.isFinite(detail)) {
      return detail;
    }

    if (typeof detail === 'string') {
      const parsed = Number(detail);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    if (detail && typeof detail === 'object' && 'value' in detail) {
      const rawValue = (detail as { value: unknown }).value;
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    const targetValue = Number(
      (event.currentTarget as HTMLInputElement | null)?.value
    );
    if (Number.isFinite(targetValue)) {
      return targetValue;
    }

    return fallback;
  }
</script>

<div id="khartis-geo-indications-tool">
  <Grid padding noGutter fullWidth>
    <Row>
      <Column>
        <div class="switch-row">
          <span class="switch-label">{m.tool_geo_indications()}</span>
          <Switch
            toggled={geoIndicationsVisible}
            labelText={m.tool_geo_indications()}
            hideLabel
            labelA={m.layers_hide()}
            labelB={m.layers_show()}
            showStateLabel
            onchange={handleVisibilityChange}
          />
        </div>
      </Column>
    </Row>
  </Grid>

  <div class="expandable-stack">
    <ExpandableSection
      title={m.geo_scale()}
      defaultOpen={state.scale.expanded}
      showToggle={true}
      toggleChecked={state.scale.enabled}
      onToggleChange={() => store.toggleScale()}
    >
      <Grid padding noGutter>
        <Row>
          <Column>
            <Select
              id="form-select"
              labelText={m.geo_scale_form()}
              selected={state.scale.form}
              on:change={handleScaleFormChange}
              size="xl"
            >
              {#each formOptions as option (option.value)}
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
                labelText={m.geo_distance()}
                value={state.scale.distance}
                on:change={(e) =>
                  store.setScaleDistance(
                    getNumericEventValue(e, state.scale.distance)
                  )}
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
              on:change={(e) => store.setScaleUnits((e as CustomEvent).detail)}
            >
              <RadioButton
                id="kilometers"
                value="kilometers"
                labelText={m.geo_kilometers()}
              />
              <RadioButton id="miles" value="miles" labelText={m.geo_miles()} />
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
    </ExpandableSection>

    <ExpandableSection
      title={m.geo_orientation()}
      defaultOpen={false}
      showToggle={true}
      toggleChecked={state.orientation.enabled}
      onToggleChange={() => store.toggleOrientation()}
    >
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
                  store.setOrientationSize(
                    getNumericEventValue(e, state.orientation.size)
                  )}
                hideTextInput
                fullWidth
              />
            </div>
          </Column>

          <Column sm={1} md={2} lg={3}>
            <div class="input-wrapper">
              <div class="value-display">
                {state.orientation.size}
              </div>
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
    </ExpandableSection>

    <ExpandableSection
      title={m.geo_inset_map()}
      defaultOpen={false}
      showToggle={true}
      toggleChecked={state.insetMap.enabled}
      onToggleChange={() => store.toggleInsetMap()}
    >
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
                  store.setInsetMapSize(
                    getNumericEventValue(e, state.insetMap.size)
                  )}
                hideTextInput
                fullWidth
              />
            </div>
          </Column>

          <Column sm={1} md={2} lg={3}>
            <div class="input-wrapper">
              <div class="value-display">
                {state.insetMap.size}
              </div>
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
          <Column>
            <Switch
              labelText={m.geo_inset_map_use_basemap_colors()}
              toggled={state.insetMap.useBasemapColors}
              labelA={m.no()}
              labelB={m.yes()}
              showStateLabel
              onchange={store.setInsetMapUseBasemapColors}
            />
          </Column>
        </Row>

        {#if !state.insetMap.useBasemapColors}
          <Row>
            <Column>
              <ColorPicker
                triggerLabel={m.geo_inset_map_continent_color()}
                hex={insetMapContinentHex}
                hue={state.insetMap.continentColor.hue}
                saturation={state.insetMap.continentColor.saturation}
                lightness={state.insetMap.continentColor.lightness}
                onValidate={({
                  hue,
                  saturation,
                  lightness
                }: ColorPickerValidateEvent) => {
                  store.setInsetMapContinentColor({
                    hue,
                    saturation,
                    lightness
                  });
                }}
              />
            </Column>
          </Row>

          <Row>
            <Column>
              <ColorPicker
                triggerLabel={m.geo_inset_map_sea_color()}
                hex={insetMapSeaHex}
                hue={state.insetMap.seaColor.hue}
                saturation={state.insetMap.seaColor.saturation}
                lightness={state.insetMap.seaColor.lightness}
                onValidate={({
                  hue,
                  saturation,
                  lightness
                }: ColorPickerValidateEvent) => {
                  store.setInsetMapSeaColor({ hue, saturation, lightness });
                }}
              />
            </Column>
          </Row>
        {/if}

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
                  store.setInsetMapZoom(
                    getNumericEventValue(e, state.insetMap.zoom)
                  )}
                hideTextInput
                fullWidth
              />
            </div>
          </Column>

          <Column sm={1} md={2} lg={3}>
            <div class="input-wrapper">
              <div class="value-display">
                {state.insetMap.zoom}%
              </div>
            </div>
          </Column>
        </Row>

        <Row>
          <Column sm={3} md={6} lg={13}>
            <div class="slider">
              <Slider
                labelText={m.geo_inset_map_center_longitude()}
                min={-180}
                max={180}
                step={1}
                value={state.insetMap.centerLongitude}
                on:change={(e) =>
                  store.setInsetMapCenterLongitude(
                    getNumericEventValue(e, state.insetMap.centerLongitude)
                  )}
                hideTextInput
                fullWidth
              />
            </div>
          </Column>

          <Column sm={1} md={2} lg={3}>
            <div class="input-wrapper">
              <div class="value-display">
                {state.insetMap.centerLongitude}°
              </div>
            </div>
          </Column>
        </Row>

        <Row>
          <Column sm={3} md={6} lg={13}>
            <div class="slider">
              <Slider
                labelText={m.geo_inset_map_center_latitude()}
                min={-90}
                max={90}
                step={1}
                value={state.insetMap.centerLatitude}
                on:change={(e) =>
                  store.setInsetMapCenterLatitude(
                    getNumericEventValue(e, state.insetMap.centerLatitude)
                  )}
                hideTextInput
                fullWidth
              />
            </div>
          </Column>

          <Column sm={1} md={2} lg={3}>
            <div class="input-wrapper">
              <div class="value-display">
                {state.insetMap.centerLatitude}°
              </div>
            </div>
          </Column>
        </Row>
      </Grid>
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

  .switch-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-02) 0;
  }

  .switch-label {
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    font-weight: 400;
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
    justify-content: center;
  }

  .value-display {
    min-width: 3rem;
    text-align: center;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
    padding: 0 var(--cds-spacing-02);
    background: var(--cds-ui-02);
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
  }
</style>
