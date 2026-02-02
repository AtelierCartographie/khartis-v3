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
  import ColorSelector from './ColorSelector.svelte';
  import SliderWithInput from './SliderWithInput.svelte';
  import ToggleWithLabel from './ToggleWithLabel.svelte';

  interface Props {
    show: boolean;
    color?: string;
    shape?: MissingDataShape;
    size?: number;
    opacity?: number;
    showPattern?: boolean;
    pattern?: boolean;
    showShapeSelector?: boolean;
    showSizeSlider?: boolean;
    showOpacitySlider?: boolean;
    onshowchange?: (show: boolean) => void;
    oncolorchange?: (color: string) => void;
    onshapechange?: (shape: MissingDataShape) => void;
    onsizechange?: (size: number) => void;
    onopacitychange?: (opacity: number) => void;
    onpatternchange?: (pattern: boolean) => void;
  }

  let {
    show = $bindable(),
    color = DEFAULT_COLORS.missingData,
    shape = MissingDataShape.CIRCLE,
    size = 2,
    opacity = 1,
    showPattern = false,
    pattern = false,
    showShapeSelector = true,
    showSizeSlider = true,
    showOpacitySlider = false,
    onshowchange,
    oncolorchange,
    onshapechange,
    onsizechange,
    onopacitychange,
    onpatternchange
  }: Props = $props();

  function handleShowToggle(value: boolean) {
    show = value;
    onshowchange?.(value);
  }

  function handleShapeChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    onshapechange?.(target.value as MissingDataShape);
  }
</script>

<div class="missing-data-section">
  <ToggleWithLabel
    label={m.show_missing_data()}
    toggled={show}
    showInfo={true}
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
                onchange={onsizechange}
              />
            </div>
          </Column>
        </Row>
      {/if}

      {#if showOpacitySlider}
        <Row>
          <Column>
            <div class="size-slider">
              <SliderWithInput
                label={m.opacity()}
                bind:value={opacity}
                min={0}
                max={100}
                onchange={onopacitychange}
              />
            </div>
          </Column>
        </Row>
      {/if}

      {#if showPattern}
        <Row>
          <Column>
            <ToggleWithLabel
              label={m.pattern()}
              toggled={pattern}
              ontoggle={onpatternchange}
            />
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
