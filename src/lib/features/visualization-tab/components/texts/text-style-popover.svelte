<script lang="ts">
  import {
    claimFloatingPanel,
    floatingPanelIn,
    floatingPanelOut
  } from '$lib/features/commons/utils/floating-panel.svelte';
  import { EVENT, KEY } from '$lib/features/commons/constants/dom.constants';
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

  let popoverRef = $state<HTMLDivElement>();
  const contextualSurfaceId =
    createExclusiveContextualSurfaceId('text-style-popover');

  // Anchored like the other panels of the side toolbar, not to its button.
  const popoverRight = $derived(resolveToolbarWidth(globalState.toolbarState));

  const showPrimarySection = $derived(visibleSection !== 'secondary');
  const showSecondarySection = $derived(visibleSection !== 'primary');
  const popoverTitle = $derived(m.text_style_popover_title());

  $effect(() => {
    if (!open) return;
    return claimFloatingPanel(handleClose);
  });

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
      in:floatingPanelIn
      out:floatingPanelOut
      class="text-style-popover"
      style:right={popoverRight}
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
    top: var(--kh-floating-window-center);
    transform: translateY(-50%);
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
    margin-top: var(--kh-gap-inline);
    padding: 0 var(--cds-spacing-05, 16px);
  }

  .popover-content {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-inline);
    padding: var(--cds-spacing-05, 16px);
    overflow-y: auto;
  }

  @media (max-width: 1023px) {
    :global(.text-style-popover) {
      right: 0 !important;
      left: 0;
      top: auto;
      bottom: calc(
        60px + env(safe-area-inset-bottom, 0px) + var(--cds-spacing-03) + 48px +
          var(--cds-spacing-03)
      );
      transform: none;
      width: 100vw;
      max-height: calc(
        100dvh - var(--cds-header-height, 48px) -
          60px - env(safe-area-inset-bottom, 0px) - var(--cds-spacing-03) -
          48px - var(--cds-spacing-03) - var(--cds-spacing-05)
      );
      border-radius: 8px 8px 0 0;
    }
  }

  @media (max-width: 640px) {
    .popover-content {
      padding-inline: var(--cds-spacing-03, 8px);
    }
  }
</style>
