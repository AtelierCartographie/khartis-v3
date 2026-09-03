<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import { projectionStore } from '$lib/features/map';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from './geo-indications.store.svelte';
  import {
    INSET_MAP_SIZE_LIMITS,
    isInsetMapAvailableForViewport,
    type ColorPickerValidateEvent
  } from './geo-indications.utils';

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
  const insetMapAvailable = $derived.by(() => {
    void mapInstanceStore.zoomLevel;
    void mapInstanceStore.deckViewState;
    void projectionStore.isProjectedCoordinates;
    void projectionStore.renderProjection;

    return isInsetMapAvailableForViewport(mapInstanceStore.getMapBounds(), {
      isProjectedCoordinates: projectionStore.isProjectedCoordinates,
      projection: projectionStore.renderProjection
    });
  });
</script>

<ExpandableSection
  title={m.geo_inset_map()}
  defaultOpen={false}
  showToggle={true}
  toggleChecked={geoState.insetMap.enabled && insetMapAvailable}
  toggleDisabled={!insetMapAvailable}
  disabled={!insetMapAvailable}
  disabledReason={!insetMapAvailable
    ? m.geo_inset_map_unavailable_scale()
    : undefined}
  description={!insetMapAvailable
    ? m.geo_inset_map_unavailable_scale()
    : undefined}
  onToggleChange={() => {
    if (insetMapAvailable) {
      store.toggleInsetMap();
    }
  }}
>
  <div class="section-content">
    <Grid noGutter>
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
          <div class="colors-row">
            <div class="color-col">
              <ColorPicker
                triggerLabel={m.geo_inset_map_continent_color()}
                hex={insetMapContinentHex}
                hue={geoState.insetMap.continentColor.hue}
                saturation={geoState.insetMap.continentColor.saturation}
                lightness={geoState.insetMap.continentColor.lightness}
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
