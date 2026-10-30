<script lang="ts">
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { portal } from '$lib/features/commons/utils/portal';
  import { scrollShadows } from '$lib/features/commons/utils/scroll-shadows';
  import PanelHeader from '$lib/features/commons/components/panel-header.svelte';
  import SimpleRadioGroup from '$lib/features/commons/components/simple-radio-group.svelte';
  import { resolveToolbarWidth } from '$lib/features/commons/utils/toolbar-width.utils';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import * as m from '$lib/paraglide/messages';
  import TextStyleSection, {
    type TextStyleSectionHandlers
  } from './text-style-section.svelte';
  import {
    TEXT_HIERARCHY,
    TEXT_HIERARCHY_ORDER,
    type TextHierarchy
  } from './text-hierarchy.utils';

  type SectionHandlers = TextStyleSectionHandlers;

  type VisibleSection = 'primary' | 'secondary' | 'both';

  interface Props {
    open: boolean;
    triggerElement?: HTMLElement;
    visibleSection?: VisibleSection;
    primary: SectionHandlers;
    secondary?: SectionHandlers;
    hierarchy?: TextHierarchy;
    onHierarchyChange?: (hierarchy: TextHierarchy) => void;
    onclose?: () => void;
  }

  let {
    open = $bindable(false),
    triggerElement,
    visibleSection = 'both',
    primary,
    secondary,
    hierarchy = TEXT_HIERARCHY.EQUAL,
    onHierarchyChange,
    onclose
  }: Props = $props();

  const HIERARCHY_LABELS: Record<TextHierarchy, () => string> = {
    [TEXT_HIERARCHY.EQUAL]: m.text_hierarchy_equal,
    [TEXT_HIERARCHY.MODERATE]: m.text_hierarchy_moderate,
    [TEXT_HIERARCHY.STRONG]: m.text_hierarchy_strong
  };
  const hierarchyItems = $derived(
    TEXT_HIERARCHY_ORDER.map((level) => ({
      value: level,
      labelText: HIERARCHY_LABELS[level]()
    }))
  );

  const DEFAULT_POPOVER_WIDTH = 320;
  const VIEWPORT_GUTTER = 16;
  const TRIGGER_GAP = 12;
  const ESTIMATED_POPOVER_HEIGHT = 380;

  let popoverRef = $state<HTMLDivElement>();
  const contextualSurfaceId =
    createExclusiveContextualSurfaceId('text-style-popover');

  const popoverPosition = $derived.by(() => {
    if (typeof window === 'undefined' || !triggerElement) {
      return {
        width: `${DEFAULT_POPOVER_WIDTH}px`,
        right: resolveToolbarWidth(globalState.toolbarState),
        top: 'var(--kh-floating-window-center)',
        left: undefined,
        transform: 'translateY(-50%)'
      };
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
    const minTop =
      (document.querySelector('.bx--header')?.getBoundingClientRect().bottom ??
        0) + VIEWPORT_GUTTER;
    if (top < minTop) {
      top = minTop;
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
      <PanelHeader
        title={popoverTitle}
        closeLabel={m.close()}
        onclose={handleClose}
      />

      <div class="kh-scroll-area">
        <div class="popover-content" use:scrollShadows>
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
            />
          {/if}

          {#if secondary}
            <div class="text-hierarchy-field">
              <SimpleRadioGroup
                name="text-hierarchy"
                legendText={m.text_hierarchy_title()}
                items={hierarchyItems}
                selected={hierarchy}
                onchange={(value) => onHierarchyChange?.(value)}
              />
            </div>
          {/if}
        </div>
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
    max-height: min(80vh, var(--kh-floating-window-max-height));
    display: flex;
    flex-direction: column;
    background: var(--cds-background, #ffffff);
    border: none;
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.14),
      0 0 1px rgba(0, 0, 0, 0.2);
    z-index: var(--z-popover);
    overflow: hidden;
  }

  .text-hierarchy-field {
    padding: 0 var(--cds-spacing-05, 16px);
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-group);
    padding: var(--cds-spacing-05, 16px);
    overflow-y: auto;
  }

  @media (max-width: 640px) {
    :global(.text-style-popover) {
      width: calc(100vw - 24px);
    }

    .popover-content {
      padding-inline: var(--cds-spacing-03, 8px);
    }
  }
</style>
