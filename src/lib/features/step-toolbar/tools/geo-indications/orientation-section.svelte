<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages.js';
  import {
    Column,
    Grid,
    RadioButton,
    RadioButtonGroup,
    Row,
    Slider
  } from 'carbon-components-svelte';
  import {
    geoIndicationsActions,
    geoIndicationsState
  } from './geo-indications.store.svelte';
  import { getNumericEventValue, type ColorPickerValidateEvent } from './utils';

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
  <Grid noGutter>
    <Row>
      <Column>
        <RadioButtonGroup
          legendText={m.geo_orientation_style()}
          selected={geoState.orientation.style}
          on:change={(e) => {
            const next = (e as CustomEvent).detail;
            if (next === geoState.orientation.style) return;
            store.setOrientationStyle(next);
          }}
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
          on:input={(e) =>
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
