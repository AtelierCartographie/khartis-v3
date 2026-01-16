<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    ComboBox,
    Grid,
    RadioButton,
    RadioButtonGroup,
    Row,
    Select,
    SelectItem,
    Slider
  } from 'carbon-components-svelte';
  import { ArrowsHorizontal } from 'carbon-icons-svelte';
  import {
    FillType,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '../../constants';

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
    discretizationMethods?: Array<{ id: number; text: string }>;
    visualization?: VisualizationConfig;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onInvertPalette?: () => void;
  }

  let {
    dataFields = [],
    discretizationMethods = [],
    visualization,
    onStyleChange,
    onInvertPalette
  }: Props = $props();

  let feedFillType = $state<FillType>(FillType.UNIQUE);
  let feedDiscretizationId = $state<number>(0);
  let feedColorFieldId = $state<number>(0);
  let feedOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);
  let feedStrokeWidth = $state<number>(VISUALIZATION_DEFAULTS.strokeWidth);
  let feedStrokeOpacity = $state<number>(VISUALIZATION_DEFAULTS.strokeOpacity);

  $effect(() => {
    if (visualization?.style) {
      const fillOp = visualization.style.fillOpacity;
      feedOpacity =
        fillOp !== undefined
          ? Math.round(fillOp * 100)
          : VISUALIZATION_DEFAULTS.fillOpacity;
      feedStrokeWidth =
        visualization.style.strokeWidth ?? VISUALIZATION_DEFAULTS.strokeWidth;
      const strokeOp = visualization.style.strokeOpacity;
      feedStrokeOpacity =
        strokeOp !== undefined
          ? Math.round(strokeOp * 100)
          : VISUALIZATION_DEFAULTS.strokeOpacity;
    }
  });

  function handleOpacityChange(value: number | null) {
    if (value === null) return;
    feedOpacity = value;
    onStyleChange?.({ fillOpacity: value / 100 });
  }

  function handleStrokeWidthChange(value: number | null) {
    if (value === null) return;
    feedStrokeWidth = value;
    onStyleChange?.({ strokeWidth: value });
  }

  function handleStrokeOpacityChange(value: number | null) {
    if (value === null) return;
    feedStrokeOpacity = value;
    onStyleChange?.({ strokeOpacity: value / 100 });
  }
</script>

<ExpandableSection
  title={m.fill()}
  defaultOpen={false}
  showToggle
  toggleChecked={false}
>
  <Grid padding noGutter>
    <Row>
      <Column>
        <h6 class="sub">{m.background()}</h6>
      </Column>
    </Row>

    <Row>
      <Column sm={4} md={8} lg={8}>
        <RadioButtonGroup legendText={m.fill()} bind:selected={feedFillType}>
          <RadioButton
            id="feed-fill-unique"
            value={FillType.UNIQUE}
            labelText={m.unique()}
          />
          <RadioButton
            id="feed-fill-classes"
            value={FillType.CLASSES}
            labelText={m.in_classes()}
          />
        </RadioButtonGroup>
      </Column>
      <Column sm={4} md={8} lg={8}>
        <ComboBox
          items={discretizationMethods}
          selectedId={feedDiscretizationId}
          on:select={(e) => (feedDiscretizationId = e.detail.selectedId)}
          placeholder={m.discretization()}
          labelText=""
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <div class="palette">
          <div class="swatch" style="--from:#ffb3b3; --to:#6c0000"></div>
          <span>{m.color_palette()}</span>
          <Button
            kind="ghost"
            size="small"
            icon={ArrowsHorizontal}
            iconDescription={m.invert_palette_tooltip()}
            on:click={() => onInvertPalette?.()}
          />
        </div>
      </Column>
    </Row>

    <Row>
      <Column sm={4} md={8} lg={13}>
        <ComboBox
          items={dataFields}
          selectedId={feedColorFieldId}
          on:select={(e) => (feedColorFieldId = e.detail.selectedId)}
          placeholder={m.color_according()}
          labelText=""
        />
      </Column>
      <Column sm={4} md={8} lg={3}>
        <CompactNumberInput
          value={feedOpacity}
          onchange={handleOpacityChange}
          min={SLIDER_LIMITS.opacity.min}
          max={SLIDER_LIMITS.opacity.max}
          width="100%"
        />
      </Column>
    </Row>

    <Row>
      <Column sm={12} md={12} lg={12}>
        <div class="slider-inline">
          <span class="min">0</span>
          <div class="slider">
            <Slider
              labelText={m.opacity()}
              hideTextInput
              min={SLIDER_LIMITS.opacity.min}
              max={SLIDER_LIMITS.opacity.max}
              step={1}
              value={feedOpacity}
              on:change={(e) => handleOpacityChange(e.detail)}
            />
          </div>
          <span class="max">100</span>
        </div>
      </Column>
    </Row>

    <Row>
      <Column>
        <h6 class="sub">{m.stroke()}</h6>
      </Column>
    </Row>

    <Row>
      <Column sm={4} md={8} lg={13}>
        <div class="slider">
          <Slider
            labelText={m.thickness()}
            min={SLIDER_LIMITS.strokeWidth.min}
            max={SLIDER_LIMITS.strokeWidth.max}
            step={1}
            value={feedStrokeWidth}
            on:change={(e) => handleStrokeWidthChange(e.detail)}
            hideTextInput
          />
        </div>
      </Column>
      <Column sm={4} md={8} lg={3}>
        <CompactNumberInput
          value={feedStrokeWidth}
          onchange={handleStrokeWidthChange}
          min={SLIDER_LIMITS.strokeWidth.min}
          max={SLIDER_LIMITS.strokeWidth.max}
          width="100%"
        />
      </Column>
    </Row>

    <Row>
      <Column sm={4} md={8} lg={8}>
        <Select id="feed-stroke-color" labelText={m.color()}>
          <SelectItem value="white" text={m.color_white()} />
          <SelectItem value="black" text={m.color_black()} />
          <SelectItem value="gray" text={m.color_gray()} />
        </Select>
      </Column>
      <Column sm={8} md={8} lg={8}>
        <div class="slider-inline">
          <span class="min">0</span>
          <div class="slider">
            <Slider
              labelText={m.opacity()}
              hideTextInput
              min={SLIDER_LIMITS.opacity.min}
              max={SLIDER_LIMITS.opacity.max}
              step={1}
              value={feedStrokeOpacity}
              on:change={(e) => handleStrokeOpacityChange(e.detail)}
            />
          </div>
          <span class="max">100</span>
        </div>
      </Column>
    </Row>
  </Grid>
</ExpandableSection>

<style lang="scss">
  .sub {
    margin: var(--cds-spacing-03) 0;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .slider-inline {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--cds-spacing-03);
    align-items: center;
  }

  .palette {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    margin: var(--cds-spacing-02) 0;
  }

  .palette .swatch {
    width: 160px;
    height: 16px;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--from), var(--to));
    border: 1px solid var(--cds-border-subtle);
  }
</style>
