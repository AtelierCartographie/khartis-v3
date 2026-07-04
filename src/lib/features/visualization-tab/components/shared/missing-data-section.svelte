<script lang="ts">
  import {
    Column,
    Dropdown,
    Grid,
    Row,
    Select,
    SelectItem
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    DEFAULT_COLORS,
    BasemapDottedPattern,
    MissingDataShape,
    SLIDER_LIMITS
  } from '$lib/features/commons/constants/visualization.constants';
  import { coerceMissingDataShape } from '../../utils/coerce.utils';
  import {
    ColorSelector,
    SliderWithInput,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';
  import PatternPicker from '$lib/features/commons/components/palette-popover/pattern-picker.svelte';
  import type { PatternParams } from '$lib/features/commons/components/palette-popover/palette.constants';
  import {
    buildDashedPatternItems,
    coerceDashedPattern
  } from './dashed-pattern.utils';

  interface Props {
    show: boolean;
    color?: string;
    shape?: MissingDataShape;
    size?: number;
    sizeLabel?: string;
    sizeMin?: number;
    sizeMax?: number;
    sizeStep?: number;
    showShapeSelector?: boolean;
    showSizeSlider?: boolean;
    showDashedToggle?: boolean;
    showPatternToggle?: boolean;
    dashed?: boolean;
    dashedPattern?: BasemapDottedPattern;
    pattern?: boolean;
    patternId?: string;
    patternParams?: PatternParams;
    onshowchange?: (show: boolean) => void;
    oncolorchange?: (color: string) => void;
    onshapechange?: (shape: MissingDataShape) => void;
    onsizechange?: (size: number) => void;
    ondashedchange?: (dashed: boolean) => void;
    ondashedpatternchange?: (pattern: BasemapDottedPattern) => void;
    onpatternchange?: (pattern: boolean) => void;
    onpatternstylechange?: (patternId: string, params: PatternParams) => void;
  }

  let {
    show = $bindable(),
    color = DEFAULT_COLORS.missingData,
    shape = MissingDataShape.CIRCLE,
    size = 2,
    sizeLabel = m.size_label(),
    sizeMin = SLIDER_LIMITS.missingDataSize.min,
    sizeMax = SLIDER_LIMITS.missingDataSize.max,
    sizeStep = SLIDER_LIMITS.missingDataSize.step,
    showShapeSelector = true,
    showSizeSlider = true,
    showDashedToggle = false,
    showPatternToggle = false,
    dashed = false,
    dashedPattern = BasemapDottedPattern.DOTS,
    pattern = false,
    patternId = 'diagonal',
    patternParams = { size: 4, scale: 8 },
    onshowchange,
    oncolorchange,
    onshapechange,
    onsizechange,
    ondashedchange,
    ondashedpatternchange,
    onpatternchange,
    onpatternstylechange
  }: Props = $props();

  const dashedPatternItems = $derived(buildDashedPatternItems());

  function handleShowToggle(value: boolean) {
    show = value;
    onshowchange?.(value);
  }

  function handleShapeChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const next = coerceMissingDataShape(target.value);
    if (next) onshapechange?.(next);
  }

  function handleDashedToggle(value: boolean) {
    dashed = value;
    ondashedchange?.(value);
  }

  function handleDashedPatternSelect(value: string | number) {
    const next = coerceDashedPattern(value);
    dashedPattern = next;
    ondashedpatternchange?.(next);
  }

  function handlePatternToggle(value: boolean) {
    pattern = value;
    onpatternchange?.(value);
  }

  function handlePatternStyleChange(id: string, params: PatternParams) {
    onpatternstylechange?.(id, params);
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
            onchange={oncolorchange}
          />
        </Column>
      </Row>

      {#if showSizeSlider}
        <Row>
          <Column>
            <div class="size-slider">
              <SliderWithInput
                label={sizeLabel}
                bind:value={size}
                min={sizeMin}
                max={sizeMax}
                step={sizeStep}
                onchange={onsizechange}
              />
            </div>
          </Column>
        </Row>
      {/if}

      {#if showPatternToggle}
        <Row>
          <Column>
            <div class="pattern-toggle">
              <ToggleWithLabel
                label={m.pattern()}
                toggled={pattern}
                ontoggle={handlePatternToggle}
              />
            </div>
          </Column>
        </Row>
        {#if pattern}
          <Row>
            <Column>
              <PatternPicker
                patternId={patternId}
                patternParams={patternParams}
                onChange={handlePatternStyleChange}
              />
            </Column>
          </Row>
        {/if}
      {/if}

      {#if showDashedToggle}
        <Row>
          <Column>
            <div class="dashed-toggle">
              <ToggleWithLabel
                label={m.dashed()}
                toggled={dashed}
                ontoggle={handleDashedToggle}
              />
            </div>
          </Column>
        </Row>
        {#if dashed}
          <Row>
            <Column>
              <Dropdown
                titleText={m.stroke_dashed_pattern()}
                items={dashedPatternItems}
                selectedId={dashedPattern}
                on:select={(e) =>
                  handleDashedPatternSelect(e.detail.selectedId)}
                type="default"
              />
            </Column>
          </Row>
        {/if}
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

  .dashed-toggle,
  .pattern-toggle {
    margin-top: var(--cds-spacing-03);
  }
</style>
