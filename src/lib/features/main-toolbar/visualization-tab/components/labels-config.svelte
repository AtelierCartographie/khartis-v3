<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import CompactNumberInput from '$lib/features/commons/components/compact-number-input.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    Checkbox,
    Column,
    ComboBox,
    Grid,
    RadioButton,
    RadioButtonGroup,
    Row,
    Select,
    SelectItem,
    Slider,
    TextInput
  } from 'carbon-components-svelte';
  import { Add } from 'carbon-icons-svelte';
  import {
    LabelPosition,
    LabelStrokeType,
    SLIDER_LIMITS,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
    visualization?: VisualizationConfig;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
  }

  let {
    dataFields = [],
    visualization: _visualization,
    onStyleChange: _onStyleChange
  }: Props = $props();

  let textFieldId = $state<number>(0);
  let textSecondaryFieldId = $state<number>(0);
  let textSize = $state<number>(VISUALIZATION_DEFAULTS.textSize);
  let textOpacity = $state<number>(VISUALIZATION_DEFAULTS.textOpacity);
  let labelBgOpacity = $state<number>(0);
  let labelStrokeType = $state<LabelStrokeType>(LabelStrokeType.NONE);
  let labelPosition = $state<LabelPosition>(LabelPosition.CENTER);
  let showMissingData = $state<boolean>(true);
  let missingText = $state<string>(m.missing_data_text());
</script>

<ExpandableSection
  title={m.labels_title()}
  defaultOpen={false}
  showToggle
  toggleChecked={true}
>
  <Grid padding noGutter>
    <Row>
      <Column>
        <h6 class="sub">{m.text_label()}</h6>
      </Column>
    </Row>

    <Row>
      <Column sm={8} md={8} lg={8}>
        <ComboBox
          items={dataFields}
          selectedId={textFieldId}
          on:select={(e) => (textFieldId = e.detail.selectedId)}
          placeholder={m.text_according()}
          labelText=""
        />
      </Column>
      <Column sm={4} md={4} lg={4}>
        <Button
          size="field"
          kind="tertiary"
          iconDescription={m.add_action()}
          icon={Add}
        />
      </Column>
      <Column sm={4} md={8} lg={8}>
        <Select id="label-color" labelText={m.color()}>
          <SelectItem value="black" text={m.color_black()} />
          <SelectItem value="blue" text={m.color_blue()} />
          <SelectItem value="gray" text={m.color_gray()} />
        </Select>
      </Column>
    </Row>

    <Row>
      <Column sm={4} md={8} lg={8}>
        <Select
          id="label-position"
          labelText={m.label_position()}
          bind:selected={labelPosition}
        >
          <SelectItem value={LabelPosition.CENTER} text={m.position_center()} />
          <SelectItem value={LabelPosition.TOP} text={m.position_top()} />
          <SelectItem value={LabelPosition.BOTTOM} text={m.position_bottom()} />
          <SelectItem value={LabelPosition.LEFT} text={m.position_left()} />
          <SelectItem value={LabelPosition.RIGHT} text={m.position_right()} />
        </Select>
      </Column>
    </Row>

    <Row>
      <Column sm={8} md={8} lg={8}>
        <ComboBox
          items={dataFields}
          selectedId={textSecondaryFieldId}
          on:select={(e) => (textSecondaryFieldId = e.detail.selectedId)}
          placeholder={m.secondary_text()}
          labelText=""
        />
      </Column>
    </Row>

    <Row>
      <Column>
        <Checkbox
          id="show-missing-data"
          labelText={m.show_no_data()}
          bind:checked={showMissingData}
        />
      </Column>
    </Row>

    <Row>
      <Column sm={8} md={8} lg={8}>
        <TextInput
          id="missing-text"
          labelText={m.text_label()}
          bind:value={missingText}
        />
      </Column>
      <Column sm={4} md={4} lg={4}>
        <Select id="missing-text-color" labelText={m.color()}>
          <SelectItem value="gray-30" text={m.color_gray()} />
          <SelectItem value="blue-60" text={m.color_blue()} />
        </Select>
      </Column>
    </Row>

    <Row>
      <Column sm={4} md={8} lg={13}>
        <div class="slider">
          <Slider
            labelText={m.text_size()}
            min={SLIDER_LIMITS.textSize.min}
            max={SLIDER_LIMITS.textSize.max}
            step={1}
            bind:value={textSize}
            hideTextInput
          />
        </div>
      </Column>
      <Column sm={4} md={8} lg={3}>
        <CompactNumberInput
          bind:value={textSize}
          min={SLIDER_LIMITS.textSize.min}
          max={SLIDER_LIMITS.textSize.max}
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
              bind:value={textOpacity}
            />
          </div>
          <span class="max">100</span>
        </div>
      </Column>
    </Row>

    <Row>
      <Column>
        <h6 class="sub">{m.background()}</h6>
      </Column>
    </Row>

    <Row>
      <Column sm={4} md={8} lg={8}>
        <Select id="label-bg-color" labelText={m.color()}>
          <SelectItem value="none" text={m.none()} />
          <SelectItem value="white" text={m.color_white()} />
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
              bind:value={labelBgOpacity}
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
      <Column sm={4} md={8} lg={8}>
        <RadioButtonGroup legendText="" bind:selected={labelStrokeType}>
          <RadioButton
            id="label-stroke-none"
            value={LabelStrokeType.NONE}
            labelText={m.none()}
          />
          <RadioButton
            id="label-stroke-unique"
            value={LabelStrokeType.UNIQUE}
            labelText={m.unique()}
          />
        </RadioButtonGroup>
      </Column>
      <Column sm={4} md={8} lg={8}>
        <Select
          id="label-stroke-color"
          labelText={m.color()}
          disabled={labelStrokeType === LabelStrokeType.NONE}
        >
          <SelectItem value="white" text={m.color_white()} />
          <SelectItem value="black" text={m.color_black()} />
          <SelectItem value="gray" text={m.color_gray()} />
        </Select>
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
</style>
