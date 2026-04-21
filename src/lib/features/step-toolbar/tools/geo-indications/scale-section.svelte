<script lang="ts">
  import {
    DistanceUnit,
    ScaleForm
  } from '$lib/features/commons/constants/ui.constants';
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { mapInstanceStore } from '$lib/features/commons/store/map-instance.store.svelte';
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
  import {
    formatScaleDistance,
    getScaleDistanceLimit,
    getScaleDistanceStep,
    getNumericEventValue,
    type ColorPickerValidateEvent
  } from './utils';

  const store = geoIndicationsActions;
  const geoState = $derived(geoIndicationsState);
  let localScaleFontFamily = $state<string>(AVAILABLE_FONTS[0]);
  let localScaleFontSize = $state<number>(LEGEND_FONT_SIZES[0]);
  let mapViewRevision = $state(0);

  $effect(() => {
    localScaleFontFamily = geoState.scale.fontFamily;
    localScaleFontSize = geoState.scale.fontSize;
  });

  $effect(() => {
    const map = mapInstanceStore.map;
    if (!map) {
      return;
    }

    const refresh = () => {
      mapViewRevision += 1;
    };

    map.on('move', refresh);
    map.on('zoom', refresh);
    map.on('resize', refresh);

    return () => {
      map.off('move', refresh);
      map.off('zoom', refresh);
      map.off('resize', refresh);
    };
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
  const scaleDistanceLimit = $derived.by(() => {
    const _revision = mapViewRevision;
    const _zoomLevel = mapInstanceStore.zoomLevel;
    void _revision;
    void _zoomLevel;

    const center = mapInstanceStore.getMapCenter();
    return getScaleDistanceLimit(geoState.scale.units, {
      map: mapInstanceStore.map,
      zoom: mapInstanceStore.currentZoom,
      centerLatitude: center?.lat ?? null
    });
  });
  const scaleDistanceStep = $derived(
    getScaleDistanceStep(
      geoState.scale.distance > 0 ? geoState.scale.distance : scaleDistanceLimit
    )
  );
  const scaleDistanceHelperText = $derived.by(() => {
    const unitLabel =
      geoState.scale.units === DistanceUnit.KILOMETERS ? 'km' : 'mi';

    return m.geo_scale_max_distance_current_view({
      distance: formatScaleDistance(scaleDistanceLimit),
      unit: unitLabel
    });
  });

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
  <div class="section-content">
    <Grid noGutter>
      <Row>
        <Column>
          <Select
            id="form-select"
            labelText={m.geo_style()}
            selected={geoState.scale.form}
            on:change={handleScaleFormChange}
            size="sm"
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
            helperText={scaleDistanceHelperText}
            on:change={(e) =>
              store.setScaleDistance(
                getNumericEventValue(e, geoState.scale.distance)
              )}
            min={0}
            max={scaleDistanceLimit}
            step={scaleDistanceStep}
            size="sm"
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
          </div>
        </Column>
      </Row>

      <Row>
        <Column>
          <ColorPicker
            triggerLabel={m.color()}
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
        </Column>
      </Row>
    </Grid>
  </div>
</ExpandableSection>

<style>
  .section-content :global(.bx--row + .bx--row) {
    margin-top: var(--cds-spacing-05);
  }

  .text-style-row {
    display: flex;
    align-items: flex-end;
    gap: var(--cds-spacing-02);
    width: 100%;
  }

  .text-style-font {
    flex: 1;
    min-width: 0;
  }

  .text-style-size {
    width: 80px;
    flex-shrink: 0;
  }
</style>
