<script lang="ts">
   
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import { MIN_FONT_SIZE } from '$lib/features/step-toolbar/fonts.constants';
  import * as m from '$lib/paraglide/messages';
  import { Close } from 'carbon-icons-svelte';
  import type { TextAlignment } from './text-alignment.utils';
  import TextStyleSection from './text-style-section.svelte';

  interface SectionHandlers {
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
    collisionDetection?: boolean;
    dxpMasking?: boolean;
    onFontFamilyChange: (value: string) => void;
    onColorChange: (value: string) => void;
    onOpacityChange?: (value: number) => void;
    onBoldChange?: (value: boolean) => void;
    onItalicChange?: (value: boolean) => void;
    onSizeChange: (value: number) => void;
    onAlignmentChange: (align: TextAlignment) => void;
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

  let popoverRef = $state<HTMLDivElement>();
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
  const popoverTitle = $derived(m.text_style_popover_title());

  function handleClose() {
    open = false;
    onclose?.();
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
          <TextStyleSection
            title={m.text_style_primary_title()}
            section={primary}
          />
        {/if}

        {#if showSecondarySection}
          <TextStyleSection
            title={m.text_style_secondary_title()}
            section={secondary}
            fallbackSize={DEFAULT_SECONDARY_FONT_SIZE}
          />
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

  @media (max-width: 640px) {
    :global(.text-style-popover) {
      width: calc(100vw - 24px);
    }

    .popover-content {
      padding: 0 var(--cds-spacing-03, 8px);
    }
  }
</style>
