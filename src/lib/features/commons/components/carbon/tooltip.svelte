<script lang="ts">
  import { Information } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';
  import { appendToBody } from '$lib/features/commons/utils/append-to-body';
  import {
    resolveCarbonTooltipPosition,
    type CarbonTooltipAlignment,
    type CarbonTooltipDirection
  } from '$lib/features/commons/utils/carbon-tooltip-position';

  interface Props {
    children?: Snippet;
    align?: CarbonTooltipAlignment;
    direction?: CarbonTooltipDirection;
    icon?: typeof Information;
    iconDescription?: string;
    triggerText?: string;
  }

  const {
    children,
    align = 'center',
    direction = 'bottom',
    icon: Icon = Information,
    iconDescription = m.more_info(),
    triggerText = ''
  }: Props = $props();

  let open = $state(false);
  let pinned = $state(false);
  let hoverTimeout = $state<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  let triggerElement = $state<HTMLButtonElement | null>(null);
  let tooltipElement = $state<HTMLDivElement | null>(null);
  let tooltipStyle = $state('');

  async function updateTooltipPosition() {
    if (!triggerElement || !tooltipElement || typeof window === 'undefined') {
      return;
    }

    await tick();

    const position = resolveCarbonTooltipPosition({
      triggerRect: triggerElement.getBoundingClientRect(),
      tooltipSize: {
        width: tooltipElement.offsetWidth,
        height: tooltipElement.offsetHeight
      },
      direction,
      align,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });

    const styles = [`top: ${position.top}px`, `left: ${position.left}px`];

    if (position.caretLeft !== undefined) {
      styles.push(`--khartis-tooltip-caret-left: ${position.caretLeft}px`);
    }

    if (position.caretTop !== undefined) {
      styles.push(`--khartis-tooltip-caret-top: ${position.caretTop}px`);
    }

    tooltipStyle = styles.join('; ');
  }

  async function show() {
    open = true;
    await updateTooltipPosition();
  }

  function hide() {
    if (!pinned) {
      open = false;
    }
  }

  function toggle() {
    pinned = !pinned;
    if (pinned) {
      void show();
      return;
    }

    open = false;
  }

  function handleMouseEnter() {
    clearTimeout(hoverTimeout);
    void show();
  }

  function handleMouseLeave() {
    hoverTimeout = setTimeout(hide, 150);
  }

  function handleTooltipMouseEnter() {
    clearTimeout(hoverTimeout);
  }

  function handleTooltipMouseLeave() {
    hoverTimeout = setTimeout(hide, 150);
  }

  $effect(() => {
    if (!open) {
      return;
    }

    void align;
    void direction;
    void updateTooltipPosition();
  });

  $effect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    const handleViewportChange = () => {
      void updateTooltipPosition();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  });

  $effect(() => {
    if (!open) {
      return;
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;

      if (
        triggerElement &&
        !triggerElement.contains(target) &&
        tooltipElement &&
        !tooltipElement.contains(target)
      ) {
        pinned = false;
        open = false;
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === KEY.ESCAPE) {
        pinned = false;
        open = false;
        triggerElement?.focus();
      }
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

<button
  type="button"
  class="khartis-carbon-rich-tooltip-trigger"
  bind:this={triggerElement}
  aria-label={triggerText || iconDescription}
  onclick={toggle}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onfocus={show}
  onblur={hide}
>
  <Icon size={16}></Icon>
  {#if triggerText}
    <span>{triggerText}</span>
  {/if}
</button>

{#if open}
  <div use:appendToBody class="khartis-carbon-rich-tooltip-portal">
    <div
      bind:this={tooltipElement}
      class="khartis-carbon-rich-tooltip khartis-carbon-rich-tooltip--{direction}"
      style={tooltipStyle}
      role="tooltip"
      onmouseenter={handleTooltipMouseEnter}
      onmouseleave={handleTooltipMouseLeave}
    >
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .khartis-carbon-rich-tooltip-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--cds-icon-secondary, var(--cds-text-02));
    cursor: pointer;
  }

  .khartis-carbon-rich-tooltip-trigger:hover {
    color: var(--cds-icon-primary, var(--cds-text-01));
  }

  .khartis-carbon-rich-tooltip-trigger:focus {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
  }

  :global(.khartis-carbon-rich-tooltip-portal) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  :global(.khartis-carbon-rich-tooltip-portal *) {
    pointer-events: auto;
  }

  :global(.khartis-carbon-rich-tooltip) {
    position: fixed;
    z-index: var(--z-popover);
    min-width: 13rem;
    max-width: 18rem;
    padding: 1rem;
    background-color: var(--cds-inverse-02, #393939);
    border-radius: 0.125rem;
    color: var(--cds-inverse-01, #ffffff);
    box-shadow: 0 2px 6px var(--cds-shadow, rgba(0, 0, 0, 0.3));
    font-size: var(--cds-body-short-01-font-size, 0.875rem);
    font-weight: var(--cds-body-short-01-font-weight, 400);
    line-height: var(--cds-body-short-01-line-height, 1.28572);
    letter-spacing: var(--cds-body-short-01-letter-spacing, 0.16px);
    word-wrap: break-word;
  }

  :global(.khartis-carbon-rich-tooltip::before) {
    position: absolute;
    width: 0;
    height: 0;
    border-style: solid;
    content: '';
  }

  :global(.khartis-carbon-rich-tooltip--top::before) {
    bottom: -0.375rem;
    left: var(--khartis-tooltip-caret-left);
    transform: translateX(-50%);
    border-width: 0.375rem 0.5rem 0;
    border-color: var(--cds-inverse-02, #393939) transparent transparent;
  }

  :global(.khartis-carbon-rich-tooltip--bottom::before) {
    top: -0.375rem;
    left: var(--khartis-tooltip-caret-left);
    transform: translateX(-50%);
    border-width: 0 0.5rem 0.375rem;
    border-color: transparent transparent var(--cds-inverse-02, #393939);
  }

  :global(.khartis-carbon-rich-tooltip--left::before) {
    top: var(--khartis-tooltip-caret-top);
    right: -0.5rem;
    transform: translateY(-50%);
    border-width: 0.5rem 0 0.5rem 0.375rem;
    border-color: transparent transparent transparent
      var(--cds-inverse-02, #393939);
  }

  :global(.khartis-carbon-rich-tooltip--right::before) {
    top: var(--khartis-tooltip-caret-top);
    left: -0.5rem;
    transform: translateY(-50%);
    border-width: 0.5rem 0.375rem 0.5rem 0;
    border-color: transparent var(--cds-inverse-02, #393939) transparent
      transparent;
  }

  :global(.khartis-carbon-rich-tooltip p) {
    margin: 0;
  }
</style>
