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
  import type {
    VisualizationConfig,
    MissingDataConfig
  } from '$lib/features/commons/store/visualization.store.svelte';

  interface LabelsStyle {
    textSize?: number;
    textOpacity?: number;
    textColor?: string;
    labelPosition?: LabelPosition;
    labelBgColor?: string;
    labelBgOpacity?: number;
    labelStrokeType?: LabelStrokeType;
    labelStrokeColor?: string;
    textColumn?: string;
    secondaryTextColumn?: string;
  }

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
    visualization?: VisualizationConfig;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onLabelsChange?: (updates: Partial<LabelsStyle>) => void;
    onMissingDataChange?: (updates: Partial<MissingDataConfig>) => void;
  }

  let {
    dataFields = [],
    visualization,
    onStyleChange,
    onLabelsChange,
    onMissingDataChange
  }: Props = $props();

  let textFieldId = $state<number>(0);
  let textSecondaryFieldId = $state<number>(0);
  let textSize = $state<number>(VISUALIZATION_DEFAULTS.textSize);
  let textOpacity = $state<number>(VISUALIZATION_DEFAULTS.textOpacity);
  let textColor = $state<string>('black');
  let labelBgColor = $state<string>('none');
  let labelBgOpacity = $state<number>(0);
  let labelStrokeType = $state<LabelStrokeType>(LabelStrokeType.NONE);
  let labelStrokeColor = $state<string>('white');
  let labelPosition = $state<LabelPosition>(LabelPosition.CENTER);
  let showMissingData = $state<boolean>(true);
  let missingText = $state<string>(m.missing_data_text());
  let enabled = $state<boolean>(false);

  function handleTextSizeChange(value: number) {
    textSize = value;
    onLabelsChange?.({ textSize: value });
  }

  function handleTextOpacityChange(value: number) {
    textOpacity = value;
    onLabelsChange?.({ textOpacity: value / 100 });
  }

  function handleTextColorChange(value: string) {
    textColor = value;
    onLabelsChange?.({ textColor: value });
  }

  function handleLabelPositionChange(value: LabelPosition) {
    labelPosition = value;
    onLabelsChange?.({ labelPosition: value });
  }

  function handleLabelBgColorChange(value: string) {
    labelBgColor = value;
    onLabelsChange?.({ labelBgColor: value });
  }

  function handleLabelBgOpacityChange(value: number) {
    labelBgOpacity = value;
    onLabelsChange?.({ labelBgOpacity: value / 100 });
  }

  function handleLabelStrokeTypeChange(value: LabelStrokeType) {
    labelStrokeType = value;
    onLabelsChange?.({ labelStrokeType: value });
  }

  function handleLabelStrokeColorChange(value: string) {
    labelStrokeColor = value;
    onLabelsChange?.({ labelStrokeColor: value });
  }

  function handleTextFieldChange(id: number) {
    textFieldId = id;
    const field = dataFields[id];
    if (field) {
      onLabelsChange?.({ textColumn: field.text });
    }
  }

  function handleSecondaryTextFieldChange(id: number) {
    textSecondaryFieldId = id;
    const field = dataFields[id];
    if (field) {
      onLabelsChange?.({ secondaryTextColumn: field.text });
    }
  }

  function handleShowMissingDataChange(checked: boolean) {
    showMissingData = checked;
    onMissingDataChange?.({ show: checked });
  }

  function handleToggleChange(checked: boolean) {
    enabled = checked;
  }
</script>

<ExpandableSection
  title={m.labels_title()}
  defaultOpen={false}
  showToggle
  toggleChecked={enabled}
  onToggleChange={handleToggleChange}
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
          on:select={(e) => handleTextFieldChange(e.detail.selectedId)}
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
        <Select
          id="label-color"
          labelText={m.color()}
          selected={textColor}
          on:change={(e) => {
            const target = e.target as HTMLSelectElement;
            handleTextColorChange(target.value);
          }}
        >
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
          selected={labelPosition}
          on:change={(e) => {
            const target = e.target as HTMLSelectElement;
            handleLabelPositionChange(target.value as LabelPosition);
          }}
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
          on:select={(e) => handleSecondaryTextFieldChange(e.detail.selectedId)}
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
          checked={showMissingData}
          on:check={(e) => handleShowMissingDataChange(e.detail)}
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
            value={textSize}
            hideTextInput
            on:change={(e) => handleTextSizeChange(e.detail)}
          />
        </div>
      </Column>
      <Column sm={4} md={8} lg={3}>
        <CompactNumberInput
          value={textSize}
          onchange={handleTextSizeChange}
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
              value={textOpacity}
              on:change={(e) => handleTextOpacityChange(e.detail)}
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
        <Select
          id="label-bg-color"
          labelText={m.color()}
          selected={labelBgColor}
          on:change={(e) => {
            const target = e.target as HTMLSelectElement;
            handleLabelBgColorChange(target.value);
          }}
        >
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
              value={labelBgOpacity}
              on:change={(e) => handleLabelBgOpacityChange(e.detail)}
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
        <RadioButtonGroup
          legendText=""
          selected={labelStrokeType}
          on:change={(e) =>
            handleLabelStrokeTypeChange(e.detail as LabelStrokeType)}
        >
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
          selected={labelStrokeColor}
          disabled={labelStrokeType === LabelStrokeType.NONE}
          on:change={(e) => {
            const target = e.target as HTMLSelectElement;
            handleLabelStrokeColorChange(target.value);
          }}
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
