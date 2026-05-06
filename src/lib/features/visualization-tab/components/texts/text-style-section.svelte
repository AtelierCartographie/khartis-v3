<script lang="ts">
  import {
    AVAILABLE_FONTS,
    clampFontSize,
    CARTOGRAPHIC_FONT_FAMILY,
    MIN_FONT_SIZE,
    normalizeFontFamily,
    resolveFontSizeOptions
  } from '$lib/features/step-toolbar/fonts.constants';
  import * as m from '$lib/paraglide/messages';
  import {
    ChevronDown,
    TextBold,
    TextColor,
    TextItalic,
    TextUnderline
  } from 'carbon-icons-svelte';
  import {
    nextAlignment,
    resolveAlignmentIcon,
    resolveAlignmentLabel,
    type TextAlignment
  } from './text-alignment.utils';

  export interface TextStyleSectionHandlers {
    fontFamily: string;
    color: string;
    opacity?: number;
    bold?: boolean;
    italic?: boolean;
    size: number;
    align: TextAlignment;
    halo?: boolean;
    haloColor?: string;
    haloWidth?: number;
    onFontFamilyChange: (value: string) => void;
    onColorChange: (value: string) => void;
    onBoldChange?: (value: boolean) => void;
    onItalicChange?: (value: boolean) => void;
    onSizeChange: (value: number) => void;
    onAlignmentChange: (align: TextAlignment) => void;
    onHaloChange?: (value: boolean) => void;
    onHaloColorChange?: (value: string) => void;
  }

  interface Props {
    title: string;
    section: TextStyleSectionHandlers | undefined;
    fallbackSize?: number;
  }

  let { title, section, fallbackSize = MIN_FONT_SIZE }: Props = $props();

  let fontSelectRef = $state<HTMLSelectElement>();
  let sizeSelectRef = $state<HTMLSelectElement>();
  let quickColorInput = $state<HTMLInputElement>();
  let quickHaloColorInput = $state<HTMLInputElement>();

  const enabled = $derived(Boolean(section));
  const align = $derived<TextAlignment>(section?.align ?? 'left');
  const AlignmentIcon = $derived(resolveAlignmentIcon(align));
  const fontSizes = $derived(
    resolveFontSizeOptions(section?.size ?? fallbackSize)
  );

  function handleFontFamilySelect(event: Event) {
    if (!section) return;
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (!value) return;
    section.onFontFamilyChange(value);
  }

  function handleSizeSelect(event: Event) {
    if (!section) return;
    const value = Number((event.currentTarget as HTMLSelectElement).value);
    if (!Number.isFinite(value)) return;
    section.onSizeChange(clampFontSize(value, MIN_FONT_SIZE));
  }

  function openSelectPicker(select?: HTMLSelectElement) {
    if (!select || select.disabled) return;
    select.focus();
    if (typeof select.showPicker === 'function') {
      select.showPicker();
      return;
    }
    select.click();
  }

  function openQuickColorInput() {
    quickColorInput?.click();
  }

  function openQuickHaloColorInput() {
    if (!section?.onHaloColorChange) return;
    section.onHaloChange?.(true);
    quickHaloColorInput?.click();
  }

  function handleQuickColorInput(event: Event) {
    if (!section) return;
    const value = (event.currentTarget as HTMLInputElement).value;
    if (!value) return;
    section.onColorChange(value);
  }

  function handleQuickHaloColorInput(event: Event) {
    if (!section) return;
    const value = (event.currentTarget as HTMLInputElement).value;
    if (!value) return;
    section.onHaloChange?.(true);
    section.onHaloColorChange?.(value);
  }
</script>

<section
  class="text-style-section"
  class:text-style-section--disabled={!enabled}
>
  <div class="text-style-section-heading">
    <h4>{title}</h4>
    <span aria-hidden="true"></span>
  </div>

  <div class="text-style-grid">
    <div class="compact-field compact-field--wide">
      <span class="compact-field__label">{m.annotations_font()}</span>
      <div class="compact-field__control" aria-disabled={!enabled}>
        <select
          bind:this={fontSelectRef}
          aria-label={m.annotations_font()}
          value={normalizeFontFamily(section?.fontFamily) ??
            CARTOGRAPHIC_FONT_FAMILY}
          disabled={!enabled}
          onchange={handleFontFamilySelect}
        >
          {#each AVAILABLE_FONTS as fontFamily (fontFamily)}
            <option value={fontFamily}>{fontFamily}</option>
          {/each}
        </select>
        <button
          type="button"
          class="compact-field__picker-trigger"
          aria-label={m.annotations_font()}
          disabled={!enabled}
          onclick={() => openSelectPicker(fontSelectRef)}
        >
          <ChevronDown size={16} />
        </button>
      </div>
    </div>

    <div class="compact-field compact-field--size">
      <span class="compact-field__label">{m.annotations_size()}</span>
      <div class="compact-field__control">
        <select
          bind:this={sizeSelectRef}
          aria-label={m.annotations_size()}
          value={String(clampFontSize(section?.size, fallbackSize))}
          disabled={!enabled}
          onchange={handleSizeSelect}
        >
          {#each fontSizes as fontSize (fontSize)}
            <option value={fontSize}>{fontSize}</option>
          {/each}
        </select>
        <button
          type="button"
          class="compact-field__picker-trigger"
          aria-label={m.annotations_size()}
          disabled={!enabled}
          onclick={() => openSelectPicker(sizeSelectRef)}
        >
          <ChevronDown size={16} />
        </button>
      </div>
    </div>
  </div>

  <div class="quick-format-toolbar" role="toolbar" aria-label={title}>
    <button
      type="button"
      class="quick-format-button"
      class:quick-format-button--active={Boolean(section?.bold)}
      aria-label={m.annotations_bold()}
      title={m.annotations_bold()}
      disabled={!section?.onBoldChange}
      onclick={() => section?.onBoldChange?.(!section.bold)}
    >
      <TextBold size={16} />
    </button>

    <button
      type="button"
      class="quick-format-button"
      class:quick-format-button--active={Boolean(section?.italic)}
      aria-label={m.annotations_italic()}
      title={m.annotations_italic()}
      disabled={!section?.onItalicChange}
      onclick={() => section?.onItalicChange?.(!section.italic)}
    >
      <TextItalic size={16} />
    </button>

    <button
      type="button"
      class="quick-format-button"
      aria-label={m.annotations_underline()}
      title={m.annotations_underline()}
      disabled
    >
      <TextUnderline size={16} />
    </button>

    <button
      type="button"
      class="quick-format-button quick-format-button--color"
      style={`--quick-format-accent: ${section?.color ?? '#8d8d8d'};`}
      aria-label={m.color()}
      title={m.color()}
      disabled={!enabled}
      onclick={openQuickColorInput}
    >
      <TextColor size={16} />
    </button>
    {#if section}
      <input
        bind:this={quickColorInput}
        class="quick-format-color-input"
        type="color"
        value={section.color}
        tabindex="-1"
        aria-hidden="true"
        oninput={handleQuickColorInput}
      />
    {/if}

    <button
      type="button"
      class="quick-format-button quick-format-button--halo"
      class:quick-format-button--active={Boolean(section?.halo)}
      style={`--quick-format-accent: ${section?.haloColor ?? '#ffffff'};`}
      aria-label={m.halo_color()}
      title={m.halo_color()}
      disabled={!section?.onHaloColorChange}
      onclick={openQuickHaloColorInput}
    >
      <span class="outline-text-icon" aria-hidden="true">
        <span class="outline-text-icon__glyph">{m.text_style_glyph()}</span>
        <span class="outline-text-icon__underline"></span>
      </span>
    </button>
    {#if section}
      <input
        bind:this={quickHaloColorInput}
        class="quick-format-color-input"
        type="color"
        value={section.haloColor ?? '#ffffff'}
        tabindex="-1"
        aria-hidden="true"
        oninput={handleQuickHaloColorInput}
      />
    {/if}

    <button
      type="button"
      class="quick-format-button"
      aria-label={resolveAlignmentLabel(align)}
      title={resolveAlignmentLabel(align)}
      disabled={!enabled}
      onclick={() => section?.onAlignmentChange(nextAlignment(align))}
    >
      <AlignmentIcon size={16} />
    </button>
  </div>
</section>

<style lang="scss">
  .text-style-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: var(--cds-spacing-05, 16px);
    background: var(--cds-layer-01, #f4f4f4);
  }

  .text-style-section--disabled {
    color: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
  }

  .text-style-section-heading {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03, 8px);
    width: 100%;

    h4 {
      margin: 0;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.2857;
      letter-spacing: 0.16px;
      color: var(--cds-text-primary, #161616);
      white-space: nowrap;
    }

    span {
      flex: 1 1 auto;
      min-width: 0;
      border-top: 1px solid var(--cds-border-strong-01, #8d8d8d);
    }
  }

  .text-style-section--disabled .text-style-section-heading {
    h4 {
      color: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
    }

    span {
      border-color: var(--cds-border-disabled, #c6c6c6);
    }
  }

  .text-style-grid {
    display: flex;
    gap: var(--cds-spacing-03, 8px);
    align-items: flex-start;
    width: 100%;
  }

  .compact-field {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1 1 auto;
  }

  .compact-field--size {
    flex: 0 0 var(--kh-text-size-control-width, 80px);
  }

  .compact-field__label {
    display: block;
    padding-bottom: var(--cds-spacing-03, 8px);
    color: var(--cds-text-secondary, #525252);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.3333;
    letter-spacing: 0.32px;
  }

  .text-style-section--disabled .compact-field__label {
    color: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
  }

  .compact-field__control {
    position: relative;
    height: 32px;
    display: flex;
    align-items: center;
    background: var(--cds-field-02, #ffffff);
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
  }

  .compact-field__control[aria-disabled='true'] {
    border-color: transparent;
    color: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
  }

  .compact-field select {
    width: 100%;
    height: 32px;
    min-height: 32px;
    padding: 0 40px 0 var(--cds-spacing-05, 16px);
    border: none;
    background: transparent;
    appearance: none;
    outline: none;
    cursor: pointer;
    color: var(--cds-text-primary, #161616);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.2857;
    letter-spacing: 0.16px;
  }

  .compact-field select:disabled,
  .text-style-section--disabled .compact-field select {
    color: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
    cursor: not-allowed;
  }

  .compact-field__picker-trigger {
    position: absolute;
    top: 0;
    right: 0;
    width: 40px;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--cds-icon-primary, #161616);
    cursor: pointer;
  }

  .compact-field__picker-trigger:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: 2px;
  }

  .compact-field__picker-trigger:disabled,
  .text-style-section--disabled .compact-field__picker-trigger {
    color: var(--cds-icon-on-color-disabled, #8d8d8d);
    cursor: not-allowed;
  }

  .quick-format-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
  }

  .quick-format-button {
    --quick-format-accent: currentColor;

    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--cds-text-primary, #161616);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;

    &:hover {
      background: var(--cds-layer-hover-01, #e8e8e8);
    }

    &:disabled {
      color: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
      cursor: not-allowed;
      background: transparent;
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus, #0f62fe);
      outline-offset: -2px;
    }
  }

  .quick-format-button--active {
    background: var(--cds-layer-hover-01, #e8e8e8);
  }

  .quick-format-button--color {
    position: relative;
  }

  .quick-format-button--color::after {
    content: '';
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 6px;
    height: 1px;
    background: var(--quick-format-accent);
  }

  .quick-format-button:disabled.quick-format-button--color::after {
    background: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
  }

  .quick-format-color-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .outline-text-icon {
    position: relative;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
  }

  .outline-text-icon__glyph {
    position: relative;
    z-index: 1;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1;
    color: var(--cds-field-02, #ffffff);
    -webkit-text-stroke: 1px var(--cds-text-primary, #161616);
    text-shadow:
      -1px 0 var(--cds-text-primary, #161616),
      0 1px var(--cds-text-primary, #161616),
      1px 0 var(--cds-text-primary, #161616),
      0 -1px var(--cds-text-primary, #161616);
  }

  .outline-text-icon__underline {
    position: absolute;
    left: 1px;
    right: 1px;
    bottom: 0;
    height: 1px;
    background: var(--quick-format-accent);
  }

  .quick-format-button:disabled .outline-text-icon__glyph {
    color: transparent;
    -webkit-text-stroke-color: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
    text-shadow:
      -1px 0 var(--cds-text-disabled, rgba(22, 22, 22, 0.25)),
      0 1px var(--cds-text-disabled, rgba(22, 22, 22, 0.25)),
      1px 0 var(--cds-text-disabled, rgba(22, 22, 22, 0.25)),
      0 -1px var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
  }

  .quick-format-button:disabled .outline-text-icon__underline {
    background: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
  }

  @media (max-width: 640px) {
    .text-style-section {
      padding: var(--cds-spacing-04, 12px);
    }

    .text-style-grid {
      flex-wrap: wrap;
    }
  }
</style>
