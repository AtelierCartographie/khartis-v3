<script lang="ts">
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import {
    AVAILABLE_FONTS,
    clampFontSize,
    DEFAULT_FONT_FAMILY,
    MIN_FONT_SIZE,
    normalizeFontFamily,
    resolveFontSizeOptions
  } from '$lib/features/step-toolbar/constants/fonts.constants';
  import * as m from '$lib/paraglide/messages';
  import {
    ChevronDown,
    Close,
    TextAlignCenter,
    TextAlignLeft,
    TextAlignRight,
    TextBold,
    TextColor,
    TextItalic,
    TextUnderline
  } from 'carbon-icons-svelte';

  interface SectionHandlers {
    fontFamily: string;
    color: string;
    opacity?: number;
    bold?: boolean;
    italic?: boolean;
    size: number;
    align: 'left' | 'center' | 'right';
    halo?: boolean;
    haloColor?: string;
    haloWidth?: number;
    collisionDetection?: boolean;
    dxpMasking?: boolean;
    onFontFamilyChange: (value: string) => void;
    onColorChange: (value: string) => void;
    onOpacityChange?: (value: number) => void;
    onBoldChange?: (value: boolean) => void;
    onItalicChange?: (value: boolean) => void;
    onSizeChange: (value: number) => void;
    onAlignmentChange: (align: 'left' | 'center' | 'right') => void;
    onHaloChange?: (value: boolean) => void;
    onHaloColorChange?: (value: string) => void;
    onHaloWidthChange?: (value: number) => void;
    onCollisionDetectionChange?: (value: boolean) => void;
    onDxpMaskingChange?: (value: boolean) => void;
  }

  type VisibleSection = 'primary' | 'secondary' | 'both';

  interface Props {
    open: boolean;
    triggerElement?: HTMLElement;
    visibleSection?: VisibleSection;
    primary: SectionHandlers;
    secondary?: SectionHandlers;
    onclose?: () => void;
  }

  let {
    open = $bindable(false),
    triggerElement,
    visibleSection = 'both',
    primary,
    secondary,
    onclose
  }: Props = $props();

  const DEFAULT_SECONDARY_FONT_SIZE = MIN_FONT_SIZE;
  const DEFAULT_POPOVER_WIDTH = 320;
  const VIEWPORT_GUTTER = 16;
  const TRIGGER_GAP = 12;
  const ESTIMATED_POPOVER_HEIGHT = 380;
  const ALIGNMENTS: Array<'left' | 'center' | 'right'> = [
    'left',
    'center',
    'right'
  ];

  let popoverRef = $state<HTMLDivElement>();
  let primaryQuickColorInput = $state<HTMLInputElement>();
  let primaryQuickHaloColorInput = $state<HTMLInputElement>();
  let secondaryQuickColorInput = $state<HTMLInputElement>();
  let secondaryQuickHaloColorInput = $state<HTMLInputElement>();
  let primaryFontSelectRef = $state<HTMLSelectElement>();
  let primarySizeSelectRef = $state<HTMLSelectElement>();
  let secondaryFontSelectRef = $state<HTMLSelectElement>();
  let secondarySizeSelectRef = $state<HTMLSelectElement>();
  const contextualSurfaceId =
    createExclusiveContextualSurfaceId('text-style-popover');

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  const popoverPosition = $derived.by(() => {
    if (typeof window === 'undefined' || !triggerElement) {
      switch (globalState.toolbarState) {
        case ToolbarState.Collapsed:
          return {
            width: `${DEFAULT_POPOVER_WIDTH}px`,
            right: '50px',
            top: '50%',
            left: undefined,
            transform: 'translateY(-50%)'
          };
        case ToolbarState.Compact:
          return {
            width: `${DEFAULT_POPOVER_WIDTH}px`,
            right: '434px',
            top: '50%',
            left: undefined,
            transform: 'translateY(-50%)'
          };
        default:
          return {
            width: `${DEFAULT_POPOVER_WIDTH}px`,
            right: '50vw',
            top: '50%',
            left: undefined,
            transform: 'translateY(-50%)'
          };
      }
    }

    const rect = triggerElement.getBoundingClientRect();
    const width = Math.min(
      DEFAULT_POPOVER_WIDTH,
      window.innerWidth - VIEWPORT_GUTTER * 2
    );
    let left = rect.left - width - TRIGGER_GAP;
    if (left < VIEWPORT_GUTTER) {
      left = Math.min(
        window.innerWidth - width - VIEWPORT_GUTTER,
        rect.right + TRIGGER_GAP
      );
    }

    let top = rect.top - 56;
    const maxTop =
      window.innerHeight - ESTIMATED_POPOVER_HEIGHT - VIEWPORT_GUTTER;
    if (top > maxTop) {
      top = maxTop;
    }
    if (top < VIEWPORT_GUTTER) {
      top = VIEWPORT_GUTTER;
    }

    return {
      width: `${width}px`,
      left: `${Math.max(VIEWPORT_GUTTER, left)}px`,
      top: `${top}px`,
      right: undefined,
      transform: 'none'
    };
  });

  const showPrimarySection = $derived(visibleSection !== 'secondary');
  const showSecondarySection = $derived(visibleSection !== 'primary');
  const PrimaryQuickAlignmentIcon = $derived(
    resolveAlignmentIcon(primary.align)
  );
  const SecondaryQuickAlignmentIcon = $derived(
    resolveAlignmentIcon(secondary?.align ?? 'left')
  );
  const primaryFontSizes = $derived(resolveFontSizeOptions(primary.size));
  const secondaryFontSizes = $derived(
    resolveFontSizeOptions(secondary?.size ?? DEFAULT_SECONDARY_FONT_SIZE)
  );
  const popoverTitle = $derived(m.text_style_popover_title());

  function handleClose() {
    open = false;
    onclose?.();
  }

  function alignmentIndex(align: 'left' | 'center' | 'right') {
    return ALIGNMENTS.indexOf(align);
  }

  function nextAlignment(
    align: 'left' | 'center' | 'right'
  ): 'left' | 'center' | 'right' {
    const currentIndex = alignmentIndex(align);
    return ALIGNMENTS[(currentIndex + 1) % ALIGNMENTS.length] ?? 'left';
  }

  function resolveAlignmentIcon(align: 'left' | 'center' | 'right') {
    switch (align) {
      case 'center':
        return TextAlignCenter;
      case 'right':
        return TextAlignRight;
      default:
        return TextAlignLeft;
    }
  }

  function resolveAlignmentLabel(align: 'left' | 'center' | 'right') {
    switch (align) {
      case 'center':
        return m.annotations_align_center();
      case 'right':
        return m.annotations_align_right();
      default:
        return m.annotations_align_left();
    }
  }

  function openQuickColorInput(input?: HTMLInputElement) {
    if (!input) {
      return;
    }

    input.click();
  }

  function openQuickHaloColorInput(
    section: SectionHandlers,
    input?: HTMLInputElement
  ) {
    if (!section.onHaloColorChange || !input) {
      return;
    }

    section.onHaloChange?.(true);
    input.click();
  }

  function handleQuickColorInput(
    onchange: (value: string) => void,
    event: Event
  ) {
    const value = (event.currentTarget as HTMLInputElement).value;
    if (!value) {
      return;
    }

    onchange(value);
  }

  function handleQuickHaloColorInput(section: SectionHandlers, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    if (!value) {
      return;
    }

    section.onHaloChange?.(true);
    section.onHaloColorChange?.(value);
  }

  function handleSizeSelect(onchange: (value: number) => void, event: Event) {
    const value = Number((event.currentTarget as HTMLSelectElement).value);
    if (!Number.isFinite(value)) {
      return;
    }

    onchange(clampFontSize(value, MIN_FONT_SIZE));
  }

  function handleFontFamilySelect(
    onchange: (value: string) => void,
    event: Event
  ) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (!value) {
      return;
    }

    onchange(value);
  }

  function openSelectPicker(select?: HTMLSelectElement) {
    if (!select || select.disabled) {
      return;
    }

    select.focus();

    if (typeof select.showPicker === 'function') {
      select.showPicker();
      return;
    }

    select.click();
  }

  function eventTargetsElement(
    path: EventTarget[],
    target: EventTarget | null,
    element?: HTMLElement | null
  ) {
    if (!element) {
      return false;
    }

    if (path.includes(element)) {
      return true;
    }

    return target instanceof Node && element.contains(target);
  }

  function eventTargetsColorPicker(path: EventTarget[]) {
    return path.some(
      (target) =>
        target instanceof HTMLElement &&
        target.id === 'khartis-color-picker-dropdown'
    );
  }

  $effect(() => {
    if (!open) {
      return;
    }

    return engageExclusiveContextualSurface(contextualSurfaceId, handleClose);
  });

  $effect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      const path = e.composedPath();
      if (
        eventTargetsElement(path, e.target, popoverRef) ||
        eventTargetsElement(path, e.target, triggerElement) ||
        eventTargetsColorPicker(path)
      ) {
        return;
      }

      handleClose();
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE) handleClose();
    }

    const timer = setTimeout(() => {
      document.addEventListener(EVENT.CLICK, handleClick);
    }, 0);
    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener(EVENT.CLICK, handleClick);
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
    };
  });
</script>

{#if open}
  <div use:portal class="text-style-popover-portal">
    <div
      bind:this={popoverRef}
      class="text-style-popover"
      style:width={popoverPosition.width}
      style:left={popoverPosition.left}
      style:right={popoverPosition.right}
      style:top={popoverPosition.top}
      style:transform={popoverPosition.transform}
      role="dialog"
      aria-label={popoverTitle}
    >
      <header class="popover-header">
        <h3>{popoverTitle}</h3>
        <button
          type="button"
          class="popover-close-button"
          aria-label={m.close()}
          onclick={handleClose}
        >
          <Close size={16} />
        </button>
      </header>

      <div class="popover-content">
        {#if showPrimarySection}
          <section class="text-style-section">
            <div class="text-style-section-heading">
              <h4>{m.text_style_primary_title()}</h4>
              <span aria-hidden="true"></span>
            </div>

            <div class="text-style-grid">
              <div class="compact-field compact-field--wide">
                <span class="compact-field__label">{m.annotations_font()}</span>
                <div class="compact-field__control">
                  <select
                    bind:this={primaryFontSelectRef}
                    aria-label={m.annotations_font()}
                    value={normalizeFontFamily(primary.fontFamily) ??
                      DEFAULT_FONT_FAMILY}
                    onchange={(event: Event) =>
                      handleFontFamilySelect(primary.onFontFamilyChange, event)}
                  >
                    {#each AVAILABLE_FONTS as fontFamily (fontFamily)}
                      <option value={fontFamily}>{fontFamily}</option>
                    {/each}
                  </select>
                  <button
                    type="button"
                    class="compact-field__picker-trigger"
                    aria-label={m.annotations_font()}
                    onclick={() => openSelectPicker(primaryFontSelectRef)}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>

              <div class="compact-field compact-field--size">
                <span class="compact-field__label">{m.annotations_size()}</span>
                <div class="compact-field__control">
                  <select
                    bind:this={primarySizeSelectRef}
                    aria-label={m.annotations_size()}
                    value={String(clampFontSize(primary.size, MIN_FONT_SIZE))}
                    onchange={(event: Event) =>
                      handleSizeSelect(primary.onSizeChange, event)}
                  >
                    {#each primaryFontSizes as fontSize (fontSize)}
                      <option value={fontSize}>{fontSize}</option>
                    {/each}
                  </select>
                  <button
                    type="button"
                    class="compact-field__picker-trigger"
                    aria-label={m.annotations_size()}
                    onclick={() => openSelectPicker(primarySizeSelectRef)}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div
              class="quick-format-toolbar"
              role="toolbar"
              aria-label={m.text_style_primary_title()}
            >
              <button
                type="button"
                class="quick-format-button"
                class:quick-format-button--active={primary.bold}
                aria-label={m.annotations_bold()}
                title={m.annotations_bold()}
                disabled={!primary.onBoldChange}
                onclick={() => primary.onBoldChange?.(!primary.bold)}
              >
                <TextBold size={16} />
              </button>

              <button
                type="button"
                class="quick-format-button"
                class:quick-format-button--active={primary.italic}
                aria-label={m.annotations_italic()}
                title={m.annotations_italic()}
                disabled={!primary.onItalicChange}
                onclick={() => primary.onItalicChange?.(!primary.italic)}
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
                style={`--quick-format-accent: ${primary.color};`}
                aria-label={m.color()}
                title={m.color()}
                onclick={() => openQuickColorInput(primaryQuickColorInput)}
              >
                <TextColor size={16} />
              </button>
              <input
                bind:this={primaryQuickColorInput}
                class="quick-format-color-input"
                type="color"
                value={primary.color}
                tabindex="-1"
                aria-hidden="true"
                oninput={(event: Event) =>
                  handleQuickColorInput(primary.onColorChange, event)}
              />

              <button
                type="button"
                class="quick-format-button quick-format-button--halo"
                class:quick-format-button--active={primary.halo}
                style={`--quick-format-accent: ${primary.haloColor ?? '#ffffff'};`}
                aria-label={m.halo_color()}
                title={m.halo_color()}
                disabled={!primary.onHaloColorChange}
                onclick={() =>
                  openQuickHaloColorInput(primary, primaryQuickHaloColorInput)}
              >
                <span class="outline-text-icon" aria-hidden="true">
                  <span class="outline-text-icon__glyph">A</span>
                  <span class="outline-text-icon__underline"></span>
                </span>
              </button>
              <input
                bind:this={primaryQuickHaloColorInput}
                class="quick-format-color-input"
                type="color"
                value={primary.haloColor ?? '#ffffff'}
                tabindex="-1"
                aria-hidden="true"
                oninput={(event: Event) =>
                  handleQuickHaloColorInput(primary, event)}
              />

              <button
                type="button"
                class="quick-format-button"
                aria-label={resolveAlignmentLabel(primary.align)}
                title={resolveAlignmentLabel(primary.align)}
                onclick={() =>
                  primary.onAlignmentChange(nextAlignment(primary.align))}
              >
                <PrimaryQuickAlignmentIcon size={16} />
              </button>
            </div>
          </section>
        {/if}

        {#if showSecondarySection}
          <section
            class="text-style-section"
            class:text-style-section--disabled={!secondary}
          >
            <div class="text-style-section-heading">
              <h4>{m.text_style_secondary_title()}</h4>
              <span aria-hidden="true"></span>
            </div>

            <div class="text-style-grid">
              <div class="compact-field compact-field--wide">
                <span class="compact-field__label">{m.annotations_font()}</span>
                <div class="compact-field__control" aria-disabled={!secondary}>
                  <select
                    bind:this={secondaryFontSelectRef}
                    aria-label={m.annotations_font()}
                    value={normalizeFontFamily(secondary?.fontFamily) ??
                      DEFAULT_FONT_FAMILY}
                    disabled={!secondary}
                    onchange={(event: Event) => {
                      if (secondary) {
                        handleFontFamilySelect(
                          secondary.onFontFamilyChange,
                          event
                        );
                      }
                    }}
                  >
                    {#each AVAILABLE_FONTS as fontFamily (fontFamily)}
                      <option value={fontFamily}>{fontFamily}</option>
                    {/each}
                  </select>
                  <button
                    type="button"
                    class="compact-field__picker-trigger"
                    aria-label={m.annotations_font()}
                    disabled={!secondary}
                    onclick={() => openSelectPicker(secondaryFontSelectRef)}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>

              <div class="compact-field compact-field--size">
                <span class="compact-field__label">{m.annotations_size()}</span>
                <div class="compact-field__control">
                  <select
                    bind:this={secondarySizeSelectRef}
                    aria-label={m.annotations_size()}
                    value={String(
                      clampFontSize(
                        secondary?.size,
                        DEFAULT_SECONDARY_FONT_SIZE
                      )
                    )}
                    disabled={!secondary}
                    onchange={(event: Event) => {
                      if (secondary) {
                        handleSizeSelect(secondary.onSizeChange, event);
                      }
                    }}
                  >
                    {#each secondaryFontSizes as fontSize (fontSize)}
                      <option value={fontSize}>{fontSize}</option>
                    {/each}
                  </select>
                  <button
                    type="button"
                    class="compact-field__picker-trigger"
                    aria-label={m.annotations_size()}
                    disabled={!secondary}
                    onclick={() => openSelectPicker(secondarySizeSelectRef)}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div
              class="quick-format-toolbar"
              role="toolbar"
              aria-label={m.text_style_secondary_title()}
            >
              <button
                type="button"
                class="quick-format-button"
                class:quick-format-button--active={Boolean(secondary?.bold)}
                aria-label={m.annotations_bold()}
                title={m.annotations_bold()}
                disabled={!secondary?.onBoldChange}
                onclick={() => {
                  if (secondary?.onBoldChange) {
                    secondary.onBoldChange(!secondary.bold);
                  }
                }}
              >
                <TextBold size={16} />
              </button>

              <button
                type="button"
                class="quick-format-button"
                class:quick-format-button--active={Boolean(secondary?.italic)}
                aria-label={m.annotations_italic()}
                title={m.annotations_italic()}
                disabled={!secondary?.onItalicChange}
                onclick={() => {
                  if (secondary?.onItalicChange) {
                    secondary.onItalicChange(!secondary.italic);
                  }
                }}
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
                style={`--quick-format-accent: ${secondary?.color ?? '#8d8d8d'};`}
                aria-label={m.color()}
                title={m.color()}
                disabled={!secondary}
                onclick={() => openQuickColorInput(secondaryQuickColorInput)}
              >
                <TextColor size={16} />
              </button>
              {#if secondary}
                <input
                  bind:this={secondaryQuickColorInput}
                  class="quick-format-color-input"
                  type="color"
                  value={secondary.color}
                  tabindex="-1"
                  aria-hidden="true"
                  oninput={(event: Event) =>
                    handleQuickColorInput(secondary.onColorChange, event)}
                />
              {/if}

              <button
                type="button"
                class="quick-format-button quick-format-button--halo"
                class:quick-format-button--active={Boolean(secondary?.halo)}
                style={`--quick-format-accent: ${secondary?.haloColor ?? '#ffffff'};`}
                aria-label={m.halo_color()}
                title={m.halo_color()}
                disabled={!secondary?.onHaloColorChange}
                onclick={() => {
                  if (secondary) {
                    openQuickHaloColorInput(
                      secondary,
                      secondaryQuickHaloColorInput
                    );
                  }
                }}
              >
                <span class="outline-text-icon" aria-hidden="true">
                  <span class="outline-text-icon__glyph">A</span>
                  <span class="outline-text-icon__underline"></span>
                </span>
              </button>
              {#if secondary}
                <input
                  bind:this={secondaryQuickHaloColorInput}
                  class="quick-format-color-input"
                  type="color"
                  value={secondary.haloColor ?? '#ffffff'}
                  tabindex="-1"
                  aria-hidden="true"
                  oninput={(event: Event) =>
                    handleQuickHaloColorInput(secondary, event)}
                />
              {/if}

              <button
                type="button"
                class="quick-format-button"
                aria-label={resolveAlignmentLabel(secondary?.align ?? 'left')}
                title={resolveAlignmentLabel(secondary?.align ?? 'left')}
                disabled={!secondary}
                onclick={() => {
                  if (secondary) {
                    secondary.onAlignmentChange(nextAlignment(secondary.align));
                  }
                }}
              >
                <SecondaryQuickAlignmentIcon size={16} />
              </button>
            </div>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  :global(.text-style-popover-portal) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  :global(.text-style-popover-portal *) {
    pointer-events: auto;
  }

  :global(.text-style-popover) {
    position: fixed;
    width: 320px;
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03, 8px);
    padding: 0 0 var(--cds-spacing-05, 16px);
    background: var(--cds-background, #ffffff);
    border: none;
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.14),
      0 0 1px rgba(0, 0, 0, 0.2);
    z-index: var(--z-popover);
    overflow: hidden;
  }

  .popover-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02, 4px);
    padding: 0 var(--cds-spacing-02, 4px) var(--cds-spacing-03, 8px)
      var(--cds-spacing-05, 16px);
    flex-shrink: 0;
    background: var(--cds-background, #ffffff);

    h3 {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.5;
      color: var(--cds-text-primary, #161616);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .popover-close-button {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--cds-icon-primary, #161616);
    cursor: pointer;

    &:hover {
      background: var(--cds-layer-hover-01, #e8e8e8);
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus, #0f62fe);
      outline-offset: -2px;
    }
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05, 16px);
    padding: 0 var(--cds-spacing-05, 16px);
    overflow-y: auto;
  }

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
    color: var(--cds-text-primary, #161616);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.2857;
    letter-spacing: 0.16px;
  }

  .compact-field select {
    height: 32px;
    min-height: 32px;
    padding: 0 40px 0 var(--cds-spacing-05, 16px);
    border: none;
    background: transparent;
    appearance: none;
    outline: none;
    cursor: pointer;
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
    :global(.text-style-popover) {
      width: calc(100vw - 24px);
    }

    .popover-content {
      padding: 0 var(--cds-spacing-03, 8px);
    }

    .text-style-section {
      padding: var(--cds-spacing-04, 12px);
    }

    .text-style-grid {
      flex-wrap: wrap;
    }

    .compact-field--size {
      flex: 0 0 var(--kh-text-size-control-width, 80px);
    }
  }
</style>
