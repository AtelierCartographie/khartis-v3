<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import * as m from '$lib/paraglide/messages';
  import {
    Dropdown,
    Select,
    SelectItem,
    TextInput,
    Toggle
  } from 'carbon-components-svelte';
  import {
    Filter,
    Information,
    MisuseOutline,
    SquareOutline,
    TextFont
  } from 'carbon-icons-svelte';
  import {
    FillMode,
    SLIDER_LIMITS,
    StrokeMode,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
  import StrokeConfig from './stroke-config.svelte';
  import { SliderWithInput } from './shared';

  interface Props {
    dataFields?: Array<{ id: number; text: string }>;
    enabled?: boolean;
    visualization?: VisualizationConfig;
    onStyleChange?: (updates: Partial<VisualizationConfig['style']>) => void;
    onEnabledChange?: (enabled: boolean) => void;
  }

  let {
    dataFields = [],
    enabled = $bindable(true),
    visualization: _visualization,
    onStyleChange: _onStyleChange,
    onEnabledChange
  }: Props = $props();

  let textFieldId = $state<number>(0);
  let textSecondaryFieldId = $state<number | null>(null);
  let showMissingData = $state<boolean>(true);
  let missingDataText = $state<string>(m.missing_data_text());
  let missingDataColor = $state<string>('gray');

  let fillMode = $state<FillMode>(FillMode.UNIQUE);
  let fillColor = $state<string>('#4589ff');
  let fillOpacity = $state<number>(VISUALIZATION_DEFAULTS.fillOpacity);

  let strokeMode = $state<StrokeMode>(StrokeMode.NONE);
  let strokeWidth = $state<number>(VISUALIZATION_DEFAULTS.strokeWidth);
  let strokeColor = $state<string>('#1e3a5f');

  const dataFieldsWithNone = $derived([
    { id: -1, text: m.none() },
    ...dataFields
  ]);

  const fillModeItems = [
    { icon: MisuseOutline, label: m.fill_mode_none(), iconSize: 16 },
    { icon: SquareOutline, label: m.fill_mode_unique(), iconSize: 16 }
  ];

  const fillModeIndex = $derived(
    [FillMode.NONE, FillMode.UNIQUE].indexOf(fillMode)
  );

  function handleFillModeChange(index: number) {
    const modes = [FillMode.NONE, FillMode.UNIQUE];
    fillMode = modes[index] || FillMode.NONE;
  }

  function handleToggleChange(checked: boolean) {
    enabled = checked;
    onEnabledChange?.(checked);
  }
</script>

<ExpandableSection
  title={m.texts_title()}
  defaultOpen={false}
  showToggle
  toggleChecked={enabled}
  onToggleChange={handleToggleChange}
>
  {#snippet icon()}
    <button type="button" class="filter-btn" aria-label={m.filter_data()}>
      <Filter size={16} />
    </button>
  {/snippet}

  <div class="texts-config">
    <h6 class="section-title">{m.text_label()}</h6>

    <div class="field-row">
      <div class="field-group flex-1">
        <Dropdown
          titleText={m.text_according()}
          items={dataFields}
          bind:selectedId={textFieldId}
          type="default"
        />
      </div>
      <button type="button" class="icon-btn" aria-label={m.text_style()}>
        <TextFont size={16} />
      </button>
    </div>

    <div class="field-row">
      <div class="field-group flex-1">
        <Dropdown
          titleText={m.secondary_text()}
          items={dataFieldsWithNone}
          bind:selectedId={textSecondaryFieldId}
          type="default"
        />
      </div>
      <button
        type="button"
        class="icon-btn"
        aria-label={m.text_style()}
        disabled={textSecondaryFieldId === -1 || textSecondaryFieldId === null}
      >
        <TextFont size={16} />
      </button>
    </div>

    <div class="missing-data-section">
      <div class="missing-data-header">
        <span class="field-label">{m.show_missing_data()}</span>
        <button type="button" class="info-btn" aria-label={m.more_info()}>
          <Information size={16} />
        </button>
      </div>
      <div class="toggle-row">
        <Toggle
          size="sm"
          bind:toggled={showMissingData}
          hideLabel
          labelA=""
          labelB=""
        />
        <span class="toggle-label">{showMissingData ? m.yes() : m.no()}</span>
      </div>

      {#if showMissingData}
        <div class="missing-data-fields">
          <div class="field-group">
            <TextInput
              labelText={m.text_label()}
              bind:value={missingDataText}
              size="sm"
            />
          </div>
          <div class="field-group">
            <Select
              id="missing-text-color"
              labelText={m.color()}
              bind:selected={missingDataColor}
              size="sm"
            >
              <SelectItem value="gray" text={m.color_gray()} />
              <SelectItem value="black" text={m.color_black()} />
              <SelectItem value="white" text={m.color_white()} />
            </Select>
          </div>
        </div>
      {/if}
    </div>

    <h6 class="section-title">{m.background()}</h6>

    <div class="field-group">
      <ToggleTabs
        items={fillModeItems}
        activeIndex={fillModeIndex}
        onChange={handleFillModeChange}
        hideInactiveLabel={true}
      />
    </div>

    {#if fillMode === FillMode.UNIQUE}
      <div class="field-group">
        <span class="field-label">{m.color()}</span>
        <div class="color-selector">
          <div
            class="color-preview"
            style="background-color: {fillColor}"
          ></div>
        </div>
      </div>

      <SliderWithInput
        label={m.opacity()}
        bind:value={fillOpacity}
        min={SLIDER_LIMITS.opacity.min}
        max={SLIDER_LIMITS.opacity.max}
        step={1}
      />
    {/if}

    <StrokeConfig
      bind:mode={strokeMode}
      bind:width={strokeWidth}
      bind:color={strokeColor}
      showThickness={true}
      showOpacity={false}
    />
  </div>
</ExpandableSection>

<style lang="scss">
  .texts-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-03);
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    margin: var(--cds-spacing-02) 0;
    padding-bottom: var(--cds-spacing-02);
    border-bottom: 1px solid var(--cds-border-subtle);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);

    &.flex-1 {
      flex: 1;
    }
  }

  .field-row {
    display: flex;
    align-items: flex-end;
    gap: var(--cds-spacing-03);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .icon-btn,
  .filter-btn,
  .info-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: var(--cds-spacing-02);
    background: var(--cds-field);
    border: 1px solid var(--cds-border-strong);
    cursor: pointer;
    color: var(--cds-icon-01);

    &:hover:not(:disabled) {
      background: var(--cds-field-hover);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .filter-btn {
    width: auto;
    height: auto;
    padding: var(--cds-spacing-02);
    background: transparent;
    border: none;
  }

  .info-btn {
    width: auto;
    height: auto;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--cds-text-02);
  }

  .missing-data-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-03);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .missing-data-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .toggle-label {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
  }

  .missing-data-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--cds-spacing-03);
  }

  .color-selector {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
    background: var(--cds-field);
    border: 1px solid var(--cds-border-strong);
    cursor: pointer;

    &:hover {
      background: var(--cds-field-hover);
    }
  }

  .color-preview {
    width: 100%;
    max-width: 180px;
    height: 24px;
    border-radius: 2px;
  }

  :global(.texts-config .bx--dropdown) {
    max-width: 100%;
  }

  :global(.texts-config .bx--select) {
    max-width: 100%;
  }

  :global(.texts-config .bx--toggle) {
    margin: 0;
  }
</style>
