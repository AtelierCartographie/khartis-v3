<script lang="ts">
  import { ScaleForm } from '$lib/features/commons/constants/ui.constants';
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
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
    SelectItem
  } from 'carbon-components-svelte';
  import {
    AVAILABLE_FONTS,
    LEGEND_FONT_SIZES
  } from '$lib/features/step-toolbar/tools/legend/legend.constants';
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from './geo-indications.store.svelte';
  import { getNumericEventValue, type ColorPickerValidateEvent } from './utils';

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

  function handleScaleFormChange(event: Event): void {
    const form = (event.currentTarget as HTMLSelectElement).value as ScaleForm;
    if (form !== geoState.scale.form) {
      store.setScaleForm(form);
    }
  }
</script>

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
          on:change={(e) => {
            const next = (e as CustomEvent).detail;
            if (next === geoState.scale.units) return;
            store.setScaleUnits(next);
          }}
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

<style>
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
</style>
