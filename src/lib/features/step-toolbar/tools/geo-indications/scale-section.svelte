<script lang="ts">
  import {
    DistanceUnit,
    ScaleForm
  } from '$lib/features/commons/constants/ui.constants';
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import { osmBasemapStore } from '$lib/features/map';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages';
  import {
    Column,
    Grid,
    NumberInput,
    Row,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';

  const scaleUnitsOptions = $derived.by(() => [
    { value: DistanceUnit.KILOMETERS, labelText: m.geo_kilometers() },
    { value: DistanceUnit.MILES, labelText: m.geo_miles() }
  ]);
  import {
    AVAILABLE_FONTS,
    CARTOGRAPHIC_FONT_FAMILY,
    clampFontSize,
    FONT_SIZE_OPTIONS,
    MIN_FONT_SIZE,
    normalizeFontFamily
  } from '$lib/features/step-toolbar/fonts.constants';
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
  } from './geo-indications.utils';
  import { getCurrentScaleDistanceContext } from './scale-distance-context.svelte';

  const store = geoIndicationsActions;
  const geoState = $derived(geoIndicationsState);
  let localScaleFontFamily = $state<string>(CARTOGRAPHIC_FONT_FAMILY);
  let localScaleFontSize = $state<number>(MIN_FONT_SIZE);
  let mapViewRevision = $state(0);

  $effect(() => {
    localScaleFontFamily =
      normalizeFontFamily(geoState.scale.fontFamily) ??
      CARTOGRAPHIC_FONT_FAMILY;
    localScaleFontSize = clampFontSize(geoState.scale.fontSize, MIN_FONT_SIZE);
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

  const formOptions = $derived.by(() => [
    { value: ScaleForm.LINE, text: m.geo_scale_form_line() },
    { value: ScaleForm.BOX, text: m.geo_scale_form_box() }
  ]);

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

    return getScaleDistanceLimit(
      geoState.scale.units,
      getCurrentScaleDistanceContext()
    );
  });
  const isScaleDisabled = $derived(
    basemapStyleStore.requiresMapLibre || osmBasemapStore.isActive
  );
  const scaleDisabledReason = $derived(
    isScaleDisabled ? m.geo_scale_unavailable_tiled_basemap() : undefined
  );
  const scaleDistanceStep = $derived(
    getScaleDistanceStep(
      geoState.scale.distance > 0 ? geoState.scale.distance : scaleDistanceLimit
    )
  );
  const scaleDistanceHelperText = $derived.by(() => {
    const unitLabel =
      geoState.scale.units === DistanceUnit.KILOMETERS
        ? m.scale_unit_km()
        : m.scale_unit_mi();

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
  description={scaleDisabledReason}
  defaultOpen={geoState.scale.expanded}
  showToggle={true}
  toggleChecked={geoState.scale.enabled && !isScaleDisabled}
  toggleDisabled={isScaleDisabled}
  disabled={isScaleDisabled}
  disabledReason={scaleDisabledReason}
  onToggleChange={() => {
    if (!isScaleDisabled) {
      store.toggleScale();
    }
  }}
>
  <div class="section-content">
    <p class="scale-center-note">{m.geo_scale_valid_at_map_center()}</p>

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
          <SimpleRadioGroup
            name="scale-units"
            legendText={m.geo_units()}
            items={scaleUnitsOptions}
            selected={geoState.scale.units}
            onchange={(value) => store.setScaleUnits(value)}
          />
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
                {#each FONT_SIZE_OPTIONS as sizeOption (sizeOption)}
                  <SelectItem value={sizeOption} text={sizeOption} />
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

  .scale-center-note {
    margin: 0 0 var(--cds-spacing-05);
    color: var(--cds-text-secondary);
    font-size: var(--cds-body-compact-01-font-size, 0.875rem);
    line-height: var(--cds-body-compact-01-line-height, 1.28572);
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
    width: var(--kh-text-size-control-width, 80px);
    flex-shrink: 0;
  }
</style>
