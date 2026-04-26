<script lang="ts">
  import {
    Column,
    Grid,
    Row,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_COLORS,
    MissingDataShape,
    SLIDER_LIMITS
  } from '../../../constants';
  import { coerceMissingDataShape } from '../../coerce.utils';
  import {
    ColorSelector,
    SliderWithInput,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';

  interface Props {
    show: boolean;
    color?: string;
    shape?: MissingDataShape;
    size?: number;
    showShapeSelector?: boolean;
    showSizeSlider?: boolean;
    onshowchange?: (show: boolean) => void;
    oncolorchange?: (color: string) => void;
    onshapechange?: (shape: MissingDataShape) => void;
    onsizechange?: (size: number) => void;
  }

  let {
    show = $bindable(),
    color = DEFAULT_COLORS.missingData,
    shape = MissingDataShape.CIRCLE,
    size = 2,
    showShapeSelector = true,
    showSizeSlider = true,
    onshowchange,
    oncolorchange,
    onshapechange,
    onsizechange
  }: Props = $props();

  function handleShowToggle(value: boolean) {
    show = value;
    onshowchange?.(value);
  }

  function handleShapeChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const next = coerceMissingDataShape(target.value);
    if (next) onshapechange?.(next);
  }
</script>

<div class="missing-data-section">
  <ToggleWithLabel
    label={m.show_missing_data()}
    toggled={show}
    infoText={m.show_missing_data_info()}
    ontoggle={handleShowToggle}
  />

  {#if show}
    <Grid padding noGutter>
      <Row>
        {#if showShapeSelector}
          <Column sm={2} md={4} lg={8}>
            <Select
              id="missing-shape"
              labelText={m.missing_data_representation()}
              selected={shape}
              size="sm"
              on:change={handleShapeChange}
            >
              <SelectItem
                value={MissingDataShape.CIRCLE}
                text={m.missing_data_shape_circle()}
              />
              <SelectItem
                value={MissingDataShape.CROSS}
                text={m.missing_data_shape_cross()}
              />
              <SelectItem
                value={MissingDataShape.SQUARE}
                text={m.missing_data_shape_square()}
              />
            </Select>
          </Column>
        {/if}
        <Column sm={2} md={4} lg={showShapeSelector ? 8 : 16}>
          <ColorSelector
            exclusive
            label={m.color()}
            value={color}
            size="small"
            onchange={oncolorchange}
          />
        </Column>
      </Row>

      {#if showSizeSlider}
        <Row>
          <Column>
            <div class="size-slider">
              <SliderWithInput
                label={m.size_label()}
                bind:value={size}
                min={SLIDER_LIMITS.missingDataSize.min}
                max={SLIDER_LIMITS.missingDataSize.max}
                step={SLIDER_LIMITS.missingDataSize.step}
                onchange={onsizechange}
              />
            </div>
          </Column>
        </Row>
      {/if}
    </Grid>
  {/if}
</div>

<style lang="scss">
  .missing-data-section {
    margin-top: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .size-slider {
    margin-top: var(--cds-spacing-03);
  }
</style>
