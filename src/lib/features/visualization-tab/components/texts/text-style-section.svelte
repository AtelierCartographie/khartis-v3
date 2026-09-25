<script lang="ts">
  import { Dropdown } from 'carbon-components-svelte';
  import {
    AVAILABLE_FONTS,
    CARTOGRAPHIC_FONT_FAMILY,
    normalizeFontFamily
  } from '$lib/features/step-toolbar/fonts.constants';
  import * as m from '$lib/paraglide/messages';
  import { TextBold, TextItalic } from 'carbon-icons-svelte';
  import {
    nextAlignment,
    resolveAlignmentIcon,
    resolveAlignmentLabel,
    type TextAlignment
  } from './text-alignment.utils';

  export interface TextStyleSectionHandlers {
    fontFamily: string;
    bold?: boolean;
    italic?: boolean;
    align: TextAlignment;
    onFontFamilyChange: (value: string) => void;
    onBoldChange?: (value: boolean) => void;
    onItalicChange?: (value: boolean) => void;
    onAlignmentChange: (align: TextAlignment) => void;
  }

  type DropdownSelectEvent = CustomEvent<{
    selectedId?: string | number;
  }>;

  interface Props {
    title: string;
    section: TextStyleSectionHandlers | undefined;
  }

  let { title, section }: Props = $props();

  const enabled = $derived(Boolean(section));
  const align = $derived<TextAlignment>(section?.align ?? 'center');
  const AlignmentIcon = $derived(resolveAlignmentIcon(align));
  const fontItems = $derived(
    AVAILABLE_FONTS.map((fontFamily) => ({
      id: fontFamily,
      text: fontFamily
    }))
  );

  function handleFontFamilySelect(event: DropdownSelectEvent) {
    if (!section) return;
    const value =
      typeof event.detail.selectedId === 'string'
        ? event.detail.selectedId
        : undefined;
    if (value === undefined) return;
    section.onFontFamilyChange(value);
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
        <Dropdown
          class="compact-dropdown"
          hideLabel
          labelText={m.annotations_font()}
          aria-label={m.annotations_font()}
          items={fontItems}
          selectedId={normalizeFontFamily(section?.fontFamily) ??
            CARTOGRAPHIC_FONT_FAMILY}
          disabled={!enabled}
          size="sm"
          type="default"
          on:select={handleFontFamilySelect}
        />
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
    gap: var(--kh-gap-param);
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
    height: var(--kh-size-sm);
    display: flex;
    align-items: center;
    background: var(--cds-field-02, #ffffff);
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
  }

  .compact-field__control[aria-disabled='true'] {
    border-color: transparent;
    color: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
  }

  .compact-field__control :global(.compact-dropdown) {
    width: 100%;
    height: var(--kh-size-sm);
    min-height: var(--kh-size-sm);
    background: transparent;
    border: none;
  }

  .compact-field__control :global(.compact-dropdown .bx--list-box__field) {
    height: var(--kh-size-sm);
    min-height: var(--kh-size-sm);
    padding-inline-start: var(--cds-spacing-05, 16px);
  }

  .quick-format-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
  }

  .quick-format-button {
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

  @media (max-width: 640px) {
    .text-style-section {
      padding: var(--cds-spacing-04, 12px);
    }

    .text-style-grid {
      flex-wrap: wrap;
    }
  }
</style>
