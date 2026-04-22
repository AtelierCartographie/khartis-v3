<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages.js';
  import {
    Column,
    Grid,
    RadioButton,
    RadioButtonGroup,
    Row
  } from 'carbon-components-svelte';
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from './geo-indications.store.svelte';
  import {
    INSET_MAP_SIZE_LIMITS,
    type ColorPickerValidateEvent
  } from './utils';

  const store = geoIndicationsActions;
  const geoState = $derived(geoIndicationsState);

  const insetMapWindowHex = $derived(
    hslToHex(
      geoState.insetMap.windowColor.hue,
      geoState.insetMap.windowColor.saturation,
      geoState.insetMap.windowColor.lightness
    )
  );
  const insetMapContinentHex = $derived(
    hslToHex(
      geoState.insetMap.continentColor.hue,
      geoState.insetMap.continentColor.saturation,
      geoState.insetMap.continentColor.lightness
    )
  );
  const insetMapSeaHex = $derived(
    hslToHex(
      geoState.insetMap.seaColor.hue,
      geoState.insetMap.seaColor.saturation,
      geoState.insetMap.seaColor.lightness
    )
  );
</script>

<ExpandableSection
  title={m.geo_inset_map()}
  defaultOpen={false}
  showToggle={true}
  toggleChecked={geoState.insetMap.enabled}
  onToggleChange={() => store.toggleInsetMap()}
>
  <div class="section-content">
    <Grid noGutter>
      <Row>
        <Column>
          <RadioButtonGroup
            legendText={m.geo_inset_map_type()}
            selected={geoState.insetMap.type}
            on:change={(e) => {
              const next = (e as CustomEvent).detail;
              if (next === geoState.insetMap.type) return;
              store.setInsetMapType(next);
            }}
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
        <Column>
          <SliderWithInput
            label={m.geo_inset_map_size()}
            min={INSET_MAP_SIZE_LIMITS[geoState.insetMap.type].min}
            max={INSET_MAP_SIZE_LIMITS[geoState.insetMap.type].max}
            step={1}
            value={geoState.insetMap.size}
            onchange={store.setInsetMapSize}
          />
        </Column>
      </Row>

      <Row>
        <Column>
          <ColorPicker
            triggerLabel={m.geo_inset_map_window_color()}
            hex={insetMapWindowHex}
            hue={geoState.insetMap.windowColor.hue}
            saturation={geoState.insetMap.windowColor.saturation}
            lightness={geoState.insetMap.windowColor.lightness}
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
          <SliderWithInput
            label={m.geo_inset_map_zoom()}
            min={0}
            max={100}
            step={1}
            value={geoState.insetMap.zoom}
            onchange={store.setInsetMapZoom}
          />
        </Column>
      </Row>

      <Row>
        <Column>
          <SliderWithInput
            label={m.geo_inset_map_center_longitude()}
            min={-180}
            max={180}
            step={1}
            value={geoState.insetMap.centerLongitude}
            showMinMax
            minLabel="-180°"
            maxLabel="180°"
            onchange={store.setInsetMapCenterLongitude}
          />
        </Column>
      </Row>

      <Row>
        <Column>
          <SliderWithInput
            label={m.geo_inset_map_center_latitude()}
            min={-90}
            max={90}
            step={1}
            value={geoState.insetMap.centerLatitude}
            showMinMax
            minLabel="-90°"
            maxLabel="90°"
            onchange={store.setInsetMapCenterLatitude}
          />
        </Column>
      </Row>

      <Row>
        <Column>
          <Switch
            labelText={m.geo_inset_map_use_basemap_colors()}
            toggled={geoState.insetMap.useBasemapColors}
            labelA={m.no()}
            labelB={m.yes()}
            showStateLabel
            onchange={store.setInsetMapUseBasemapColors}
          />
        </Column>
      </Row>

      <Row>
        <Column>
          <div class="colors-row">
            <div class="color-col">
              <ColorPicker
                triggerLabel={m.geo_inset_map_continent_color()}
                hex={insetMapContinentHex}
                hue={geoState.insetMap.continentColor.hue}
                saturation={geoState.insetMap.continentColor.saturation}
                lightness={geoState.insetMap.continentColor.lightness}
                disabled={geoState.insetMap.useBasemapColors}
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
            </div>
            <div class="color-col">
              <ColorPicker
                triggerLabel={m.geo_inset_map_sea_color()}
                hex={insetMapSeaHex}
                hue={geoState.insetMap.seaColor.hue}
                saturation={geoState.insetMap.seaColor.saturation}
                lightness={geoState.insetMap.seaColor.lightness}
                disabled={geoState.insetMap.useBasemapColors}
                onValidate={({
                  hue,
                  saturation,
                  lightness
                }: ColorPickerValidateEvent) => {
                  store.setInsetMapSeaColor({ hue, saturation, lightness });
                }}
              />
            </div>
          </div>
        </Column>
      </Row>
    </Grid>
  </div>
</ExpandableSection>

<style>
  .section-content :global(.bx--row + .bx--row) {
    margin-top: var(--cds-spacing-05);
  }

  .colors-row {
    display: flex;
    gap: var(--cds-spacing-05);
    width: 100%;
  }

  .color-col {
    flex: 1;
    min-width: 0;
  }
</style>
