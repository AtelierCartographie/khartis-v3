<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import {
    Category,
    MisuseOutline,
    SquareOutline,
    Tag
  } from 'carbon-icons-svelte';
  import {
    SLIDER_LIMITS,
    StrokeMode,
    VISUALIZATION_DEFAULTS
  } from '../../constants';
  import { SliderWithInput } from './shared';

  interface Props {
    mode?: StrokeMode;
    width?: number;
    opacity?: number;
    color?: string;
    colorFieldId?: number;
    dataFields?: Array<{ id: number; text: string }>;
    showClasses?: boolean;
    showCategories?: boolean;
    showThickness?: boolean;
    showOpacity?: boolean;
    onModeChange?: (mode: StrokeMode) => void;
    onWidthChange?: (width: number) => void;
    onOpacityChange?: (opacity: number) => void;
    onColorChange?: (color: string) => void;
    onColorFieldChange?: (fieldId: number) => void;
  }

  let {
    mode = $bindable(StrokeMode.NONE),
    width = $bindable(VISUALIZATION_DEFAULTS.strokeWidth),
    opacity = $bindable(VISUALIZATION_DEFAULTS.strokeOpacity),
    color = $bindable('#1e3a5f'),
    colorFieldId = $bindable(0),
    dataFields = [],
    showClasses = false,
    showCategories = false,
    showThickness = true,
    showOpacity = false,
    onModeChange,
    onWidthChange,
    onOpacityChange,
    onColorChange: _onColorChange,
    onColorFieldChange: _onColorFieldChange
  }: Props = $props();

  const strokeModeItemsSimple = [
    { icon: MisuseOutline, label: m.stroke_mode_none(), iconSize: 16 },
    { icon: SquareOutline, label: m.stroke_mode_unique(), iconSize: 16 }
  ];

  const strokeModeItemsFull = [
    { icon: MisuseOutline, label: m.stroke_mode_none(), iconSize: 16 },
    { icon: SquareOutline, label: m.stroke_mode_unique(), iconSize: 16 },
    { icon: Category, label: m.stroke_mode_classes(), iconSize: 16 },
    { icon: Tag, label: m.stroke_mode_categories(), iconSize: 16 }
  ];

  const strokeModeItems = $derived(
    showClasses || showCategories ? strokeModeItemsFull : strokeModeItemsSimple
  );

  const availableModes = $derived(
    showClasses || showCategories
      ? [
          StrokeMode.NONE,
          StrokeMode.UNIQUE,
          StrokeMode.CLASSES,
          StrokeMode.CATEGORIES
        ]
      : [StrokeMode.NONE, StrokeMode.UNIQUE]
  );

  const modeIndex = $derived(availableModes.indexOf(mode));

  function handleModeChange(index: number) {
    const newMode = availableModes[index] || StrokeMode.NONE;
    mode = newMode;
    onModeChange?.(newMode);
  }

  function handleWidthChange(value: number) {
    width = value;
    onWidthChange?.(value);
  }

  function handleOpacityChange(value: number) {
    opacity = value;
    onOpacityChange?.(value);
  }
</script>

<div class="stroke-config">
  <h6 class="section-title">{m.stroke()}</h6>

  <div class="field-group">
    <ToggleTabs
      items={strokeModeItems}
      activeIndex={modeIndex}
      onChange={handleModeChange}
      hideInactiveLabel={true}
    />
  </div>

  {#if mode === StrokeMode.UNIQUE}
    {#if showThickness}
      <SliderWithInput
        label={m.thickness()}
        bind:value={width}
        min={SLIDER_LIMITS.strokeWidth.min}
        max={SLIDER_LIMITS.strokeWidth.max}
        step={1}
        onchange={handleWidthChange}
      />
    {/if}

    <div class="field-group">
      <span class="field-label">{m.color()}</span>
      <div class="color-selector">
        <div class="color-preview" style="background-color: {color}"></div>
      </div>
    </div>

    {#if showOpacity}
      <SliderWithInput
        label={m.opacity()}
        bind:value={opacity}
        min={SLIDER_LIMITS.opacity.min}
        max={SLIDER_LIMITS.opacity.max}
        step={1}
        onchange={handleOpacityChange}
      />
    {/if}
  {:else if mode === StrokeMode.CLASSES && showClasses}
    <div class="field-group">
      <Dropdown
        titleText={m.color_according()}
        items={dataFields}
        bind:selectedId={colorFieldId}
        type="default"
      />
    </div>

    {#if showThickness}
      <SliderWithInput
        label={m.thickness()}
        bind:value={width}
        min={SLIDER_LIMITS.strokeWidth.min}
        max={SLIDER_LIMITS.strokeWidth.max}
        step={1}
        onchange={handleWidthChange}
      />
    {/if}
  {:else if mode === StrokeMode.CATEGORIES && showCategories}
    <div class="field-group">
      <Dropdown
        titleText={m.color_according()}
        items={dataFields}
        bind:selectedId={colorFieldId}
        type="default"
      />
    </div>

    {#if showThickness}
      <SliderWithInput
        label={m.thickness()}
        bind:value={width}
        min={SLIDER_LIMITS.strokeWidth.min}
        max={SLIDER_LIMITS.strokeWidth.max}
        step={1}
        onchange={handleWidthChange}
      />
    {/if}
  {/if}
</div>

<style lang="scss">
  .stroke-config {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
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
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
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
</style>
