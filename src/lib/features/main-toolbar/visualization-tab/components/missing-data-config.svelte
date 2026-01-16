<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Toggle } from 'carbon-components-svelte';
  import { ChevronDown } from 'carbon-icons-svelte';
  import { SLIDER_LIMITS, VISUALIZATION_DEFAULTS } from '../../constants';
  import { SliderWithInput } from './shared';

  interface Props {
    show?: boolean;
    color?: string;
    dashed?: boolean;
    width?: number;
    showDashed?: boolean;
    showWidth?: boolean;
    onShowChange?: (value: boolean) => void;
    onColorChange?: (color: string) => void;
    onDashedChange?: (value: boolean) => void;
    onWidthChange?: (width: number) => void;
  }

  let {
    show = $bindable(true),
    color = $bindable('#c6c6c6'),
    dashed = $bindable(false),
    width = $bindable(VISUALIZATION_DEFAULTS.strokeWidth),
    showDashed = true,
    showWidth = true,
    onShowChange,
    onColorChange: _onColorChange,
    onDashedChange,
    onWidthChange
  }: Props = $props();

  function handleShowChange(toggled: boolean) {
    show = toggled;
    onShowChange?.(toggled);
  }

  function handleDashedChange(toggled: boolean) {
    dashed = toggled;
    onDashedChange?.(toggled);
  }

  function handleWidthChange(value: number) {
    width = value;
    onWidthChange?.(value);
  }
</script>

<div class="missing-data-section">
  <div class="missing-data-header">
    <span class="field-label">{m.show_no_data()}</span>
    <div class="info-icon">
      <span class="info-circle">i</span>
    </div>
  </div>

  <div class="toggle-row">
    <Toggle
      size="sm"
      toggled={show}
      on:toggle={(e) => handleShowChange(e.detail.toggled)}
      hideLabel
      labelA=""
      labelB=""
    />
    <span class="toggle-label">{show ? m.yes() : m.no()}</span>
  </div>

  {#if show}
    <div class="field-group">
      <span class="field-label">{m.color()}</span>
      <button type="button" class="color-selector">
        <div class="color-preview" style="background-color: {color}"></div>
        <ChevronDown size={16} />
      </button>
    </div>

    {#if showDashed}
      <div class="field-group toggle-inline">
        <span class="field-label">{m.dashed()}</span>
        <div class="toggle-with-label">
          <Toggle
            size="sm"
            toggled={dashed}
            on:toggle={(e) => handleDashedChange(e.detail.toggled)}
            hideLabel
            labelA=""
            labelB=""
          />
          <span class="toggle-label">{dashed ? m.yes() : m.no()}</span>
        </div>
      </div>
    {/if}

    {#if showWidth}
      <SliderWithInput
        label={m.thickness()}
        bind:value={width}
        min={1}
        max={SLIDER_LIMITS.strokeWidth.max}
        step={1}
        onchange={handleWidthChange}
      />
    {/if}
  {/if}
</div>

<style lang="scss">
  .missing-data-section {
    margin-top: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .missing-data-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .info-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .info-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--cds-text-02);
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--cds-text-02);
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

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);

    &.toggle-inline {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .color-selector {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
    background: var(--cds-field);
    border: 1px solid var(--cds-border-strong);
    cursor: pointer;
    width: 100%;

    &:hover {
      background: var(--cds-field-hover);
    }
  }

  .color-preview {
    width: 100%;
    max-width: 120px;
    height: 24px;
    border-radius: 2px;
  }

  .toggle-with-label {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  :global(.missing-data-section .bx--toggle) {
    margin: 0;
  }
</style>
