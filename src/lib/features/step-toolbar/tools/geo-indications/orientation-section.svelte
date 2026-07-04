<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { OrientationIndicatorStyle } from '$lib/features/commons/constants/ui.constants';
  import * as m from '$lib/paraglide/messages';
  import { Column, Grid, Row } from 'carbon-components-svelte';
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';

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
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from './geo-indications.store.svelte';
  import type { ColorPickerValidateEvent } from './geo-indications.utils';

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
  defaultOpen={false}
  showToggle={true}
  toggleChecked={geoState.orientation.enabled}
  onToggleChange={() => store.toggleOrientation()}
>
  <div class="section-content">
    <p class="orientation-center-note">
      {m.geo_orientation_valid_at_map_center()}
    </p>

    <Grid noGutter>
      <Row>
        <Column>
          <SimpleRadioGroup
            name="orientation-style"
            legendText={m.geo_orientation_style()}
            items={orientationStyleOptions}
            selected={geoState.orientation.style}
            onchange={(value) => store.setOrientationStyle(value)}
          />
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
