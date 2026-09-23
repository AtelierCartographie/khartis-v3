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
    SliderWithInput,
    ToggleWithLabel
  } from '$lib/features/commons/components/viz-controls';
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';
  import {
    COLOR_ROLE,
    getColorSuggestions
  } from '$lib/features/commons/services/color-suggestion.service';
  import type { PatternPaletteConfig } from '$lib/features/commons/constants/pattern.constants';
  import {
    buildDashedPatternItems,
    coerceDashedPattern
  } from './dashed-pattern.utils';
  import { getMissingDataAvailability } from './missing-data-availability';

  const DEFAULT_PATTERN_CONFIG: PatternPaletteConfig = {
    shape: 'line',
    angle: 45,
    scale: 0.7,
    color: '#000000'
  };

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
    patternConfig?: PatternPaletteConfig;
    onshowchange?: (show: boolean) => void;
    oncolorchange?: (color: string) => void;
    onshapechange?: (shape: MissingDataShape) => void;
    onsizechange?: (size: number) => void;
    ondashedchange?: (dashed: boolean) => void;
    ondashedpatternchange?: (pattern: BasemapDottedPattern) => void;
    onpatternchange?: (pattern: boolean) => void;
    onpatternstylechange?: (config: PatternPaletteConfig) => void;
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
    patternConfig = DEFAULT_PATTERN_CONFIG,
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
  const hasMissingData = $derived.by(getMissingDataAvailability());

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

  function handlePatternChange(config: PatternPaletteConfig | undefined) {
    pattern = Boolean(config);
    onpatternchange?.(Boolean(config));
    if (config) {
      patternConfig = config;
      onpatternstylechange?.(config);
    }
  }
</script>

<div class="missing-data-section">
  <ToggleWithLabel
    label={m.show_missing_data()}
    toggled={show && hasMissingData}
    disabled={!hasMissingData}
    infoText={m.show_missing_data_info()}
    ontoggle={handleShowToggle}
  />

  {#if !hasMissingData}
    <p class="missing-data-none">{m.missing_data_none()}</p>
  {:else if show}
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
          <SingleColorPreview
            exclusive
            label={m.color()}
            color={color}
            presets={getColorSuggestions(COLOR_ROLE.MISSING_DATA)}
            allowPattern={showPatternToggle}
            patternPaletteConfig={pattern ? patternConfig : undefined}
            onchange={oncolorchange}
            onpatternchange={handlePatternChange}
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
                size="sm"
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

  .missing-data-none {
    font-size: 0.75rem;
    color: var(--cds-text-helper);
  }

  .size-slider {
    margin-top: var(--cds-spacing-03);
  }

  .dashed-toggle {
    margin-top: var(--cds-spacing-03);
  }
</style>
