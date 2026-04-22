<script lang="ts">
  import { Information } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';

  interface Props {
    text: string;
    align?: 'top' | 'bottom';
  }

  let { text, align = 'bottom' }: Props = $props();

  let open = $state(false);
  let pinned = $state(false);
  let hoverTimeout = $state<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  let btnRef = $state<HTMLButtonElement | undefined>(undefined);
  let tooltipRef = $state<HTMLDivElement | undefined>(undefined);
  let tooltipPos = $state({ top: 0, left: 0 });

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  }

  function updatePosition() {
    if (!btnRef) return;
    const rect = btnRef.getBoundingClientRect();
    if (align === 'top') {
      tooltipPos = {
        top: rect.top - 8,
        left: rect.left + rect.width / 2
      };
    } else {
      tooltipPos = {
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2
      };
    }
  }

  function show() {
    updatePosition();
    open = true;
  }

  function hide() {
    if (!pinned) {
      open = false;
    }
  }

  function toggle() {
    if (pinned) {
      pinned = false;
      open = false;
    } else {
      updatePosition();
      pinned = true;
      open = true;
    }
  }

  function handleMouseEnter() {
    clearTimeout(hoverTimeout);
    show();
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
    if (!open) return;

    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        btnRef &&
        !btnRef.contains(target) &&
        tooltipRef &&
        !tooltipRef.contains(target)
      ) {
        pinned = false;
        open = false;
      }
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === KEY.ESCAPE) {
        pinned = false;
        open = false;
        btnRef?.focus();
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

<span class="info-popover-wrapper">
  <button
    type="button"
    class="info-btn"
    bind:this={btnRef}
    aria-label={m.more_info()}
    onclick={toggle}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    onfocus={show}
    onblur={hide}
  >
    <Information size={16} />
  </button>
</span>

{#if open}
  <div use:portal class="info-portal-container">
    <div
      bind:this={tooltipRef}
      class="info-tooltip {align === 'top'
        ? 'info-tooltip--top'
        : 'info-tooltip--bottom'}"
      style="top: {tooltipPos.top}px; left: {tooltipPos.left}px;"
      role="tooltip"
      onmouseenter={handleTooltipMouseEnter}
      onmouseleave={handleTooltipMouseLeave}
    >
      <div class="info-tooltip-arrow"></div>
      <p class="info-tooltip-text">{text}</p>
    </div>
  </div>
{/if}

<style lang="scss">
  .info-popover-wrapper {
    display: inline-flex;
    align-items: center;
  }

  .info-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-secondary, var(--cds-text-02));
    flex-shrink: 0;

    &:hover {
      color: var(--cds-icon-primary, var(--cds-text-01));
    }

    &:focus {
      outline: 2px solid var(--cds-focus);
      outline-offset: 2px;
    }
  }

  :global(.info-portal-container) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  :global(.info-portal-container *) {
    pointer-events: auto;
  }

  :global(.info-tooltip) {
    position: fixed;
    transform: translateX(-50%);
    background-color: var(--cds-inverse-01, #393939);
    color: var(--cds-inverse-02, #fff);
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    border-radius: 4px;
    max-width: 240px;
    white-space: normal;
    z-index: var(--z-popover);
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.3),
      0 0 1px rgba(0, 0, 0, 0.15);
  }

  :global(.info-tooltip--top) {
    transform: translateX(-50%) translateY(-100%);
  }

  :global(.info-tooltip--bottom .info-tooltip-arrow) {
    position: absolute;
    top: -5px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid var(--cds-inverse-01, #393939);
  }

  :global(.info-tooltip--top .info-tooltip-arrow) {
    position: absolute;
    bottom: -5px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--cds-inverse-01, #393939);
  }

  :global(.info-tooltip-text) {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
  }
</style>
