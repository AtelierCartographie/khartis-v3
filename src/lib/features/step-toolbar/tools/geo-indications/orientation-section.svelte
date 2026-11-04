<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { OrientationIndicatorStyle } from '$lib/features/commons/constants/ui.constants';
  import * as m from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from './geo-indications.store.svelte';
  import type { ColorPickerValidateEvent } from './geo-indications.utils';

  const orientationStyleOptions = $derived.by(() => [
    {
      value: OrientationIndicatorStyle.ARROW,
      labelText: m.geo_orientation_arrow()
    },
    {
      value: OrientationIndicatorStyle.COMPASS,
      labelText: m.geo_orientation_compass()
    }
  ]);

  interface Props {
    open: boolean;
    onToggle: (expanded: boolean) => void;
  }

  const { open, onToggle }: Props = $props();

  const store = geoIndicationsActions;
  const geoState = $derived(geoIndicationsState);

  const orientationHex = $derived(
    hslToHex(
      geoState.orientation.color.hue,
      geoState.orientation.color.saturation,
      geoState.orientation.color.lightness
    )
  );
</script>

<ExpandableSection
  title={m.geo_orientation()}
  open={open}
  onToggle={onToggle}
  animateBody
  showToggle={true}
  toggleChecked={geoState.orientation.enabled}
  onToggleChange={() => store.toggleOrientation()}
  scrollIntoViewOnOpen
>
  <div class="section-content">
    <p class="orientation-center-note">
      {m.geo_orientation_valid_at_map_center()}
    </p>

    <Grid noGutter>
      <Row>
        <Column>
          <div
            class="orientation-style-field"
            role="group"
            aria-labelledby="orientation-style-label"
          >
            <span id="orientation-style-label" class="bx--label">
              {m.geo_orientation_style()}
            </span>
            <ToggleTabs
              size="sm"
              items={orientationStyleOptions.map((option) => ({
                label: option.labelText
              }))}
              activeIndex={orientationStyleOptions.findIndex(
                (option) => option.value === geoState.orientation.style
              )}
              onchange={(index) =>
                store.setOrientationStyle(orientationStyleOptions[index].value)}
              hideInactiveLabel={false}
            />
          </div>
        </Column>
      </Row>

      <Row>
        <Column>
          <SliderWithInput
            label={m.geo_orientation_size()}
            min={5}
            max={30}
            step={1}
            value={geoState.orientation.size}
            onchange={store.setOrientationSize}
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
      <Row>
        <Column>
          <SliderWithInput
            label={m.legend_opacity()}
            value={geoState.orientation.opacity}
            min={0}
            max={100}
            step={1}
            inputWidth="72px"
            showSteppers={false}
            onchange={store.setOrientationOpacity}
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

  .orientation-center-note {
    margin: 0 0 var(--cds-spacing-05);
    color: var(--cds-text-secondary);
    font-size: var(--cds-body-compact-01-font-size, 0.875rem);
    line-height: var(--cds-body-compact-01-line-height, 1.28572);
  }
</style>
