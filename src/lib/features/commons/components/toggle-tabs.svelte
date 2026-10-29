<script lang="ts">
  import type { Component } from 'svelte';
  import TooltipBubble from './carbon/tooltip-bubble.svelte';
  import type { CarbonTooltipDirection } from '$lib/features/commons/utils/carbon-tooltip-position';

  interface ToggleItem {
    icon?: Component;
    label: string;
    iconSize?: number;
    disabled?: boolean;
  }

  interface Props {
    activeIndex?: number;
    items?: ToggleItem[];
    onchange?: (index: number) => void;
    ondblclick?: (index: number) => void;
    className?: string;
    activeClass?: string;
    fullWidthClass?: string;
    hideInactiveLabel?: boolean;
    tabTitle?: (index: number, isActive: boolean) => string | undefined;
    tooltipPosition?: CarbonTooltipDirection;
    size?: 'sm' | 'md';
  }

  let {
    activeIndex = 0,
    items = [],
    onchange,
    ondblclick,
    className = '',
    activeClass = 'active',
    fullWidthClass = 'full-width',
    hideInactiveLabel = true,
    tabTitle,
    tooltipPosition = 'bottom',
    size = 'sm'
  }: Props = $props();

  const DEFAULT_ICON_SIZE = 20;
  // Hover intent, as in Radix menus: the first tab unfolds once the pointer
  // rests on it, a move to a neighbour switches at once, and the bar folds
  // back after a short grace when the pointer leaves it.
  const HOVER_INTENT_DELAY = 120;
  const LEAVE_GRACE_DELAY = 160;

  let tabElements = $state<Array<HTMLButtonElement | null>>([]);
  let labelElements = $state<Array<HTMLSpanElement | null>>([]);
  let hoveredIndex = $state<number | null>(null);
  let pointerExpandedIndex = $state<number | null>(null);
  let intentTimer: ReturnType<typeof setTimeout> | undefined;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;

  const tooltipTrigger = $derived(
    hoveredIndex === null ? null : (tabElements[hoveredIndex] ?? null)
  );
  // A tab unfolds on hover and shows its label: only an extra hint from
  // tabTitle is worth a tooltip.
  const tooltipText = $derived(
    hoveredIndex === null
      ? ''
      : (tabTitle?.(hoveredIndex, activeIndex === hoveredIndex) ?? '')
  );

  // max-width cannot transition to auto, so each label unfolds to its
  // measured width. Measuring again on hover and focus follows font and
  // density changes.
  function measureLabel(index: number): void {
    const label = labelElements[index];
    if (!label) return;
    // scrollWidth rounds down; one more pixel keeps a fitting label whole.
    label.style.setProperty('--_label-width', `${label.scrollWidth + 1}px`);
  }

  $effect(() => {
    void activeIndex;
    void items;
    labelElements.forEach((_, index) => measureLabel(index));
  });

  $effect(() => {
    return () => {
      clearTimeout(intentTimer);
      clearTimeout(leaveTimer);
    };
  });

  function handleTabPointerEnter(event: PointerEvent, index: number): void {
    if (event.pointerType === 'touch') return;
    clearTimeout(intentTimer);
    clearTimeout(leaveTimer);
    measureLabel(index);
    if (pointerExpandedIndex !== null) {
      pointerExpandedIndex = index;
      return;
    }
    intentTimer = setTimeout(() => {
      pointerExpandedIndex = index;
    }, HOVER_INTENT_DELAY);
  }

  function handleGroupPointerLeave(): void {
    clearTimeout(intentTimer);
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      pointerExpandedIndex = null;
    }, LEAVE_GRACE_DELAY);
  }

  function showTooltip(index: number): void {
    measureLabel(index);
    hoveredIndex = index;
  }

  function hideTooltip(index: number): void {
    if (hoveredIndex === index) {
      hoveredIndex = null;
    }
  }

  function handleClick(index: number): void {
    if (index === activeIndex || items[index]?.disabled) {
      return;
    }

    onchange?.(index);
  }

  function handleDoubleClick(index: number): void {
    if (items[index]?.disabled) {
      return;
    }

    ondblclick?.(index);
  }
</script>

<div
  class="khartis-toggle-tabs toggle-tabs {className}"
  class:size-md={size === 'md'}
  role="group"
  onpointerleave={handleGroupPointerLeave}
>
  {#each items as item, index (index)}
    <button
      type="button"
      bind:this={tabElements[index]}
      class="toggle-tab {activeIndex === index
        ? activeClass
        : ''} {activeIndex === index ? fullWidthClass : ''} {index === 0 &&
      activeIndex === 0
        ? 'expand-right'
        : ''} {index === items.length - 1 && activeIndex === index
        ? 'expand-left'
        : ''}"
      class:expanded={activeIndex === index || !hideInactiveLabel}
      class:pointer-expanded={pointerExpandedIndex === index && !item.disabled}
      style:--_icon-size="{item.iconSize || DEFAULT_ICON_SIZE}px"
      aria-pressed={activeIndex === index}
      disabled={item.disabled}
      onclick={() => handleClick(index)}
      ondblclick={() => handleDoubleClick(index)}
      onpointerenter={(event: PointerEvent) =>
        handleTabPointerEnter(event, index)}
      onmouseenter={() => showTooltip(index)}
      onmouseleave={() => hideTooltip(index)}
      onfocus={() => showTooltip(index)}
      onblur={() => hideTooltip(index)}
    >
      {#if item.icon}
        {@const Icon = item.icon}
        <Icon size={item.iconSize || DEFAULT_ICON_SIZE} class="toggle-icon" />
      {/if}
      <span class="toggle-label" bind:this={labelElements[index]}>
        {item.label}
      </span>
    </button>
  {/each}
</div>

{#if tooltipTrigger && tooltipText}
  <TooltipBubble
    text={tooltipText}
    trigger={tooltipTrigger}
    direction={tooltipPosition}
  />
{/if}

<style>
  /* --toggle-tab-size, --toggle-tab-height and --toggle-tab-expanded-padding
     let a host fit the tabs to its own grid. */
  .toggle-tabs {
    --_tab-size: var(--toggle-tab-size, var(--kh-size-sm));
    --_tab-height: var(--toggle-tab-height, var(--_tab-size));
    --_tab-expanded-padding: var(
      --toggle-tab-expanded-padding,
      var(--kh-pad-panel)
    );
    /* Folding and unfolding share one duration and curve and start
       together, so their widths offset each other and the active tab does
       not swing back and forth between two hovered tabs. */
    --_motion-duration: 240ms;
    --_motion-easing: cubic-bezier(0.2, 0, 0.38, 0.9);
    display: flex;
    overflow: hidden;
    border-radius: 4px;
    width: 100%;
  }

  .toggle-tabs.size-md {
    --_tab-size: var(--toggle-tab-size, var(--kh-size-md));
  }

  /* Tabs stay left-aligned in every state: folded, the inline padding
     centres the icon in its square, so unfolding only slides it. The 2px
     cover the borders; min-width keeps every folded tab exactly square. */
  .toggle-tab {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0;
    min-width: var(--_tab-size);
    height: var(--_tab-height);
    padding: 0 calc((var(--_tab-size) - var(--_icon-size) - 2px) / 2);
    background: transparent;
    color: var(--cds-text-secondary);
    fill: currentColor;
    border: 1px solid var(--cds-border-subtle-01);
    border-right: none;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: var(--kh-font-body);
    line-height: var(--kh-line-body);
    font-weight: 400;
    letter-spacing: 0.16px;
    cursor: pointer;
    flex: 0 1 auto;
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      padding var(--_motion-duration) var(--_motion-easing),
      gap var(--_motion-duration) var(--_motion-easing);
  }

  .toggle-tab:last-child {
    border-right: 1px solid var(--cds-border-subtle-01);
    border-radius: 0 4px 4px 0;
  }

  .toggle-tab:first-child {
    border-radius: 4px 0 0 4px;
  }

  /* The active tab takes the room left over, and gives it back to a tab
     that unfolds next to it: the bar keeps its width. */
  .toggle-tab.full-width {
    flex: 1 1 0;
  }

  .toggle-label {
    display: block;
    min-width: 0;
    max-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    opacity: 0;
    /* Folding: the label fades out before the width clips it. */
    transition:
      max-width var(--_motion-duration) var(--_motion-easing),
      opacity 100ms ease;
  }

  .toggle-tab.expanded,
  .toggle-tab.pointer-expanded,
  .toggle-tab:focus-visible:not(:disabled) {
    gap: var(--kh-gap-inline);
    padding-inline: var(--_tab-expanded-padding);
  }

  /* Unfolding: the label fades in once the tab has started to open. */
  .toggle-tab.expanded .toggle-label,
  .toggle-tab.pointer-expanded .toggle-label,
  .toggle-tab:focus-visible:not(:disabled) .toggle-label {
    max-width: var(--_label-width, none);
    opacity: 1;
    transition:
      max-width var(--_motion-duration) var(--_motion-easing),
      opacity 180ms ease 60ms;
  }

  .toggle-tab.active {
    color: var(--cds-text-primary);
    background-color: var(--cds-border-subtle-01);
    border-color: var(--cds-border-subtle-01);
    z-index: var(--z-base);
  }

  .toggle-tab:not(.active) {
    color: var(--cds-text-secondary);
  }

  .toggle-tab:hover:not(.active):not(:disabled) {
    background-color: var(--cds-layer-hover-01);
    color: var(--cds-text-primary);
  }

  .toggle-tab:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: -2px;
  }

  .toggle-tab:disabled {
    cursor: not-allowed;
    color: var(--cds-text-disabled);
    background-color: transparent;
  }

  .khartis-toggle-tabs :global(.toggle-icon) {
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle-tab,
    .toggle-label {
      transition: none;
    }
  }
</style>
