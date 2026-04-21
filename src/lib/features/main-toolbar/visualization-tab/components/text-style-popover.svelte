<script lang="ts">
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { AVAILABLE_FONTS } from '$lib/features/step-toolbar/constants/fonts.constants';
  import * as m from '$lib/paraglide/messages';
  import {
    ChevronDown,
    TextAlignCenter,
    TextAlignLeft,
    TextAlignRight,
    TextBold,
    TextColor,
    TextItalic,
    TextUnderline
  } from 'carbon-icons-svelte';
  import { SectionHeading } from './shared';

  interface SectionHandlers {
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

  const DEFAULT_FONT_FAMILY = AVAILABLE_FONTS[0] ?? 'Cabin';
  const DEFAULT_FONT_SIZES = ['8', '10', '12', '14', '16', '18', '20', '24'];
  const DEFAULT_POPOVER_WIDTH = 488;
  const VIEWPORT_GUTTER = 16;
  const TRIGGER_GAP = 12;
  const ESTIMATED_POPOVER_HEIGHT = 264;
  const ALIGNMENTS: Array<'left' | 'center' | 'right'> = [
    'left',
    'center',
    'right'
  ];

  let popoverRef = $state<HTMLDivElement>();
  let primaryQuickColorInput = $state<HTMLInputElement>();
  let secondaryQuickColorInput = $state<HTMLInputElement>();
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
  const showSecondarySection = $derived(
    Boolean(secondary) && visibleSection !== 'primary'
  );
  const showSectionHeadings = $derived(visibleSection === 'both');
  const PrimaryQuickAlignmentIcon = $derived(
    resolveAlignmentIcon(primary.align)
  );
  const SecondaryQuickAlignmentIcon = $derived(
    resolveAlignmentIcon(secondary?.align ?? 'left')
  );
  const primaryFontSizes = $derived(getFontSizeOptions(primary.size));
  const secondaryFontSizes = $derived(
    getFontSizeOptions(secondary?.size ?? Number(DEFAULT_FONT_SIZES[0]))
  );
  const popoverTitle = $derived.by(() => {
    switch (visibleSection) {
      case 'primary':
        return m.text_style_primary_title();
      case 'secondary':
        return m.text_style_secondary_title();
      default:
        return m.text_style_popover_title();
    }
  });

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

  function getFontSizeOptions(size: number) {
    const nextSize = String(size);
    if (DEFAULT_FONT_SIZES.includes(nextSize)) {
      return DEFAULT_FONT_SIZES;
    }

    return [...DEFAULT_FONT_SIZES, nextSize].sort(
      (left, right) => Number(left) - Number(right)
    );
  }

  function openQuickColorInput(input?: HTMLInputElement) {
    if (!input) {
      return;
    }

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

  function handleSizeSelect(onchange: (value: number) => void, event: Event) {
    const value = Number((event.currentTarget as HTMLSelectElement).value);
    if (!Number.isFinite(value)) {
      return;
    }

    onchange(value);
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
      const target = e.target as Node;
      if (popoverRef && !popoverRef.contains(target)) {
        if (triggerElement && triggerElement.contains(target)) return;
        const path = e.composedPath() as Element[];
        if (path.some((el) => el.id === 'khartis-color-picker-dropdown')) {
          return;
        }
        handleClose();
      }
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
        <span class="popover-header-divider" aria-hidden="true"></span>
      </header>

      <div class="popover-content">
        {#if showPrimarySection}
          <section class="text-style-section">
            {#if showSectionHeadings}
              <SectionHeading title={m.text_style_primary_title()} />
            {/if}

            <div class="text-style-grid">
              <div class="compact-field compact-field--wide">
                <span class="compact-field__label">{m.annotations_font()}</span>
                <div
                  class="compact-field__control compact-field__control--static"
                >
                  <span class="compact-field__value">
                    {DEFAULT_FONT_FAMILY}
                  </span>
                  <span class="compact-field__icon" aria-hidden="true">
                    <ChevronDown size={24} />
                  </span>
                </div>
              </div>

              <label class="compact-field">
                <span class="compact-field__label">{m.annotations_size()}</span>
                <div class="compact-field__control">
                  <select
                    aria-label={m.annotations_size()}
                    value={String(primary.size)}
                    onchange={(event: Event) =>
                      handleSizeSelect(primary.onSizeChange, event)}
                  >
                    {#each primaryFontSizes as fontSize (fontSize)}
                      <option value={fontSize}>{fontSize}</option>
                    {/each}
                  </select>
                  <span class="compact-field__icon" aria-hidden="true">
                    <ChevronDown size={24} />
                  </span>
                </div>
              </label>
            </div>

            <div
              class="quick-format-toolbar"
              role="toolbar"
              aria-label={m.text_style()}
            >
              {#if primary.onBoldChange}
                <button
                  type="button"
                  class="quick-format-button"
                  class:quick-format-button--active={primary.bold}
                  aria-label={m.annotations_bold()}
                  title={m.annotations_bold()}
                  onclick={() => primary.onBoldChange?.(!primary.bold)}
                >
                  <TextBold size={24} />
                </button>
              {/if}

              {#if primary.onItalicChange}
                <button
                  type="button"
                  class="quick-format-button"
                  class:quick-format-button--active={primary.italic}
                  aria-label={m.annotations_italic()}
                  title={m.annotations_italic()}
                  onclick={() => primary.onItalicChange?.(!primary.italic)}
                >
                  <TextItalic size={24} />
                </button>
              {/if}

              <button
                type="button"
                class="quick-format-button"
                aria-label={m.annotations_underline()}
                title={m.annotations_underline()}
                aria-disabled="true"
              >
                <TextUnderline size={24} />
              </button>

              <button
                type="button"
                class="quick-format-button quick-format-button--color"
                style={`--quick-format-accent: ${primary.color};`}
                aria-label={m.color()}
                title={m.color()}
                onclick={() => openQuickColorInput(primaryQuickColorInput)}
              >
                <TextColor size={24} />
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

              {#if primary.onHaloChange}
                <button
                  type="button"
                  class="quick-format-button"
                  class:quick-format-button--active={primary.halo}
                  aria-label={m.halo()}
                  title={m.halo()}
                  onclick={() =>
                    primary.onHaloChange?.(!(primary.halo ?? false))}
                >
                  <span class="outline-text-icon" aria-hidden="true">
                    <span class="outline-text-icon__glyph">A</span>
                    <span class="outline-text-icon__underline"></span>
                  </span>
                </button>
              {/if}

              <button
                type="button"
                class="quick-format-button"
                aria-label={resolveAlignmentLabel(primary.align)}
                title={resolveAlignmentLabel(primary.align)}
                onclick={() =>
                  primary.onAlignmentChange(nextAlignment(primary.align))}
              >
                <PrimaryQuickAlignmentIcon size={24} />
              </button>
            </div>
          </section>
        {/if}

        {#if secondary && showSecondarySection}
          <section class="text-style-section">
            {#if showSectionHeadings}
              <SectionHeading title={m.text_style_secondary_title()} />
            {/if}

            <div class="text-style-grid">
              <div class="compact-field compact-field--wide">
                <span class="compact-field__label">{m.annotations_font()}</span>
                <div
                  class="compact-field__control compact-field__control--static"
                >
                  <span class="compact-field__value">
                    {DEFAULT_FONT_FAMILY}
                  </span>
                  <span class="compact-field__icon" aria-hidden="true">
                    <ChevronDown size={24} />
                  </span>
                </div>
              </div>

              <label class="compact-field">
                <span class="compact-field__label">{m.annotations_size()}</span>
                <div class="compact-field__control">
                  <select
                    aria-label={m.annotations_size()}
                    value={String(secondary.size)}
                    onchange={(event: Event) =>
                      handleSizeSelect(secondary.onSizeChange, event)}
                  >
                    {#each secondaryFontSizes as fontSize (fontSize)}
                      <option value={fontSize}>{fontSize}</option>
                    {/each}
                  </select>
                  <span class="compact-field__icon" aria-hidden="true">
                    <ChevronDown size={24} />
                  </span>
                </div>
              </label>
            </div>

            <div
              class="quick-format-toolbar"
              role="toolbar"
              aria-label={m.text_style()}
            >
              <button
                type="button"
                class="quick-format-button"
                aria-label={m.annotations_underline()}
                title={m.annotations_underline()}
                aria-disabled="true"
              >
                <TextUnderline size={24} />
              </button>

              <button
                type="button"
                class="quick-format-button quick-format-button--color"
                style={`--quick-format-accent: ${secondary.color};`}
                aria-label={m.color()}
                title={m.color()}
                onclick={() => openQuickColorInput(secondaryQuickColorInput)}
              >
                <TextColor size={24} />
              </button>
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

              {#if secondary.onHaloChange}
                <button
                  type="button"
                  class="quick-format-button"
                  class:quick-format-button--active={secondary.halo}
                  aria-label={m.halo()}
                  title={m.halo()}
                  onclick={() =>
                    secondary.onHaloChange?.(!(secondary.halo ?? false))}
                >
                  <span class="outline-text-icon" aria-hidden="true">
                    <span class="outline-text-icon__glyph">A</span>
                    <span class="outline-text-icon__underline"></span>
                  </span>
                </button>
              {/if}

              <button
                type="button"
                class="quick-format-button"
                aria-label={resolveAlignmentLabel(secondary.align)}
                title={resolveAlignmentLabel(secondary.align)}
                onclick={() =>
                  secondary.onAlignmentChange(nextAlignment(secondary.align))}
              >
                <SecondaryQuickAlignmentIcon size={24} />
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
    width: 488px;
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    padding: 24px;
    background: var(--cds-layer-01, #f4f4f4);
    border: 1px solid var(--cds-border-subtle-01, #e0e0e0);
    box-shadow:
      0 12px 32px rgba(0, 0, 0, 0.16),
      0 0 1px rgba(0, 0, 0, 0.2);
    z-index: var(--z-popover);
    overflow: hidden;
  }

  .popover-header {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 24px;
    flex-shrink: 0;

    h3 {
      margin: 0;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: 1.75rem;
      font-weight: 600;
      line-height: 1.15;
      color: var(--cds-text-primary, #161616);
      white-space: nowrap;
    }
  }

  .popover-header-divider {
    flex: 1;
    height: 2px;
    background: var(--cds-border-strong-01, #8d8d8d);
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
  }

  .text-style-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .text-style-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 20px;
    align-items: end;
  }

  .compact-field {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .compact-field__label {
    color: var(--cds-text-secondary, #525252);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    font-weight: 400;
    letter-spacing: 0.16px;
  }

  .compact-field__control {
    position: relative;
    min-height: 56px;
    display: flex;
    align-items: center;
    background: var(--cds-field-01, #ffffff);
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
  }

  .compact-field__control--static {
    padding: 0 48px 0 16px;
  }

  .compact-field__value,
  .compact-field select {
    width: 100%;
    color: var(--cds-text-primary, #161616);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 1.125rem;
    font-weight: 400;
    line-height: 1.25;
    letter-spacing: 0;
  }

  .compact-field select {
    min-height: 56px;
    padding: 0 48px 0 16px;
    border: none;
    background: transparent;
    appearance: none;
    outline: none;
    cursor: pointer;
  }

  .compact-field__icon {
    position: absolute;
    top: 50%;
    right: 12px;
    transform: translateY(-50%);
    color: var(--cds-icon-primary, #161616);
    pointer-events: none;
  }

  .quick-format-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .quick-format-button {
    --quick-format-accent: currentColor;

    width: 40px;
    height: 40px;
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

    &:focus-visible {
      outline: 2px solid var(--cds-focus, #0f62fe);
      outline-offset: 2px;
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
    bottom: 8px;
    height: 3px;
    border-radius: 999px;
    background: var(--quick-format-accent);
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
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
  }

  .outline-text-icon__glyph {
    position: relative;
    z-index: 1;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1;
    color: var(--cds-layer-01, #f4f4f4);
    -webkit-text-stroke: 1.4px var(--cds-text-primary, #161616);
    text-shadow:
      -1px 0 var(--cds-text-primary, #161616),
      0 1px var(--cds-text-primary, #161616),
      1px 0 var(--cds-text-primary, #161616),
      0 -1px var(--cds-text-primary, #161616);
  }

  .outline-text-icon__underline {
    position: absolute;
    left: 2px;
    right: 2px;
    bottom: 0;
    height: 3px;
    border-radius: 999px;
    background: currentColor;
  }

  @media (max-width: 640px) {
    :global(.text-style-popover) {
      width: calc(100vw - 24px);
      padding: 18px;
    }

    .popover-header {
      gap: 16px;
      margin-bottom: 18px;
    }

    .text-style-grid {
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .quick-format-toolbar {
      gap: 10px;
    }

    .quick-format-button {
      width: 36px;
      height: 36px;
    }
  }
</style>
