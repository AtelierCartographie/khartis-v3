<script lang="ts">
  import { ScaleForm } from '$lib/features/commons/constants/ui.constants';
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages.js';
  import {
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
    AVAILABLE_FONTS,
    LEGEND_FONT_SIZES
  } from '$lib/features/step-toolbar/tools/legend/legend.constants';
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from './geo-indications.store.svelte';

  const store = geoIndicationsActions;
  const geoState = $derived(geoIndicationsState);
  let localScaleFontFamily = $state<string>(AVAILABLE_FONTS[0]);
  let localScaleFontSize = $state<number>(LEGEND_FONT_SIZES[0]);

  $effect(() => {
    localScaleFontFamily = geoState.scale.fontFamily;
    localScaleFontSize = geoState.scale.fontSize;
  });

  const formOptions = [
    { value: ScaleForm.LINE, text: m.geo_scale_form_line() },
    { value: ScaleForm.BOX, text: m.geo_scale_form_box() }
  ];

  const scaleHex = $derived(
    hslToHex(
      geoState.scale.color.hue,
      geoState.scale.color.saturation,
      geoState.scale.color.lightness
    )
  );
  const orientationHex = $derived(
    hslToHex(
      geoState.orientation.color.hue,
      geoState.orientation.color.saturation,
      geoState.orientation.color.lightness
    )
  );
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

  type ColorPickerValidateEvent = {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  };

  function handleScaleFormChange(event: Event): void {
    const form = (event.currentTarget as HTMLSelectElement).value as ScaleForm;
    if (form !== geoState.scale.form) {
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
      <Column></Column>
    </Row>
  </Grid>

  <div class="expandable-stack">
    <ExpandableSection
      title={m.geo_scale()}
      defaultOpen={geoState.scale.expanded}
      showToggle={true}
      toggleChecked={geoState.scale.enabled}
      onToggleChange={() => store.toggleScale()}
    >
      <Grid noGutter>
        <Row>
          <Column>
            <Select
              id="form-select"
              labelText={m.geo_style()}
              selected={geoState.scale.form}
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
          <Column>
            <NumberInput
              id="distance-input"
              labelText={m.geo_distance()}
              value={geoState.scale.distance}
              on:change={(e) =>
                store.setScaleDistance(
                  getNumericEventValue(e, geoState.scale.distance)
                )}
              min={0}
              step={500}
              size="xl"
            />
          </Column>
        </Row>

        <Row>
          <Column>
            <RadioButtonGroup
              legendText={m.geo_units()}
              selected={geoState.scale.units}
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
            <div class="text-style-row">
              <div class="text-style-font">
                <Select
                  id="scale-font-select"
                  labelText={m.legend_font()}
                  selected={localScaleFontFamily}
                  on:change={(event) => {
                    const nextFontFamily = (
                      event.currentTarget as HTMLSelectElement
                    ).value;
                    localScaleFontFamily = nextFontFamily;
                    store.setScaleFontFamily(nextFontFamily);
                  }}
                  size="sm"
                >
                  {#each AVAILABLE_FONTS as f (f)}
                    <SelectItem value={f} text={f} />
                  {/each}
                </Select>
              </div>
              <div class="text-style-size">
                <Select
                  id="scale-font-size"
                  labelText={m.legend_font_size()}
                  selected={String(localScaleFontSize)}
                  on:change={(event) => {
                    const nextFontSize = Number(
                      (event.currentTarget as HTMLSelectElement).value
                    );
                    if (!Number.isFinite(nextFontSize)) {
                      return;
                    }

                    localScaleFontSize = nextFontSize;
                    store.setScaleFontSize(nextFontSize);
                  }}
                  size="sm"
                >
                  {#each LEGEND_FONT_SIZES as s (s)}
                    <SelectItem value={String(s)} text={String(s)} />
                  {/each}
                </Select>
              </div>
              <div class="text-style-color">
                <ColorPicker
                  hex={scaleHex}
                  hue={geoState.scale.color.hue}
                  saturation={geoState.scale.color.saturation}
                  lightness={geoState.scale.color.lightness}
                  onValidate={({
                    hue,
                    saturation,
                    lightness
                  }: ColorPickerValidateEvent) => {
                    store.setScaleColor({ hue, saturation, lightness });
                  }}
                />
              </div>
            </div>
          </Column>
        </Row>
      </Grid>
    </ExpandableSection>

    <ExpandableSection
      title={m.geo_orientation()}
      defaultOpen={false}
      showToggle={true}
      toggleChecked={geoState.orientation.enabled}
      onToggleChange={() => store.toggleOrientation()}
    >
      <Grid noGutter>
        <Row>
          <Column>
            <RadioButtonGroup
              legendText={m.geo_orientation_style()}
              selected={geoState.orientation.style}
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
          <Column>
            <Slider
              labelText={m.geo_orientation_size()}
              min={5}
              max={30}
              step={1}
              value={geoState.orientation.size}
              on:change={(e) =>
                store.setOrientationSize(
                  getNumericEventValue(e, geoState.orientation.size)
                )}
              minLabel=""
              maxLabel=""
              hideTextInput={false}
              fullWidth
            />
          </Column>
        </Row>

        <Row>
          <Column>
            <ColorPicker
              triggerLabel={m.geo_orientation_color()}
              hex={orientationHex}
              hue={geoState.orientation.color.hue}
              saturation={geoState.orientation.color.saturation}
              lightness={geoState.orientation.color.lightness}
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
      toggleChecked={geoState.insetMap.enabled}
      onToggleChange={() => store.toggleInsetMap()}
    >
      <Grid noGutter>
        <Row>
          <Column>
            <RadioButtonGroup
              legendText={m.geo_inset_map_type()}
              selected={geoState.insetMap.type}
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
          <Column>
            <Slider
              labelText={m.geo_inset_map_size()}
              min={20}
              max={1600}
              step={1}
              value={geoState.insetMap.size}
              on:change={(e) =>
                store.setInsetMapSize(
                  getNumericEventValue(e, geoState.insetMap.size)
                )}
              minLabel=""
              maxLabel=""
              hideTextInput={false}
              fullWidth
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
            <Slider
              labelText={m.geo_inset_map_zoom()}
              min={0}
              max={100}
              step={1}
              value={geoState.insetMap.zoom}
              on:change={(e) =>
                store.setInsetMapZoom(
                  getNumericEventValue(e, geoState.insetMap.zoom)
                )}
              minLabel=""
              maxLabel=""
              hideTextInput={false}
              fullWidth
            />
          </Column>
        </Row>

        <Row>
          <Column>
            <Slider
              labelText={m.geo_inset_map_centering()}
              min={-180}
              max={180}
              step={1}
              value={geoState.insetMap.centerLongitude}
              on:change={(e) =>
                store.setInsetMapCenterLongitude(
                  getNumericEventValue(e, geoState.insetMap.centerLongitude)
                )}
              minLabel="-180°"
              maxLabel="180°"
              hideTextInput={false}
              fullWidth
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

  .text-style-row {
    display: flex;
    align-items: flex-end;
    gap: var(--cds-spacing-02);
  }

  .text-style-font {
    flex: 1;
    min-width: 0;
  }

  .text-style-size {
    width: 80px;
    flex-shrink: 0;
  }

  .text-style-color {
    flex-shrink: 0;
    padding-bottom: 1px;
  }

  #khartis-geo-indications-tool :global(.bx--slider-container) {
    width: 100%;
  }

  #khartis-geo-indications-tool :global(.bx--slider) {
    min-width: auto !important;
    max-width: none !important;
    flex: 1;
    margin: 0 0.5rem;
  }

  #khartis-geo-indications-tool :global(.bx--slider__track) {
    background: var(--cds-ui-03);
  }

  #khartis-geo-indications-tool :global(.bx--slider__filled-track) {
    background: var(--cds-text-01);
  }

  #khartis-geo-indications-tool :global(.bx--slider-text-input) {
    width: 3.5rem !important;
    min-width: 3.5rem !important;
    flex-shrink: 0;
    text-align: center;
  }

  #khartis-geo-indications-tool :global(.bx--slider__range-label) {
    min-width: 2rem;
    font-size: 0.75rem;
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
