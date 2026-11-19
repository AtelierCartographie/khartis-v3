<script lang="ts">
  import { tick } from 'svelte';
  import { splitShortcutKeys } from '$lib/features/commons/utils/keyboard-shortcuts.utils';
  import { portal } from '$lib/features/commons/utils/portal';
  import {
    type CarbonTooltipAlignment,
    type CarbonTooltipDirection,
    resolveCarbonTooltipPosition
  } from '$lib/features/commons/utils/carbon-tooltip-position';

  interface Props {
    text: string;
    shortcut?: string;
    trigger: HTMLElement | null;
    direction?: CarbonTooltipDirection;
    align?: CarbonTooltipAlignment;
  }

  const {
    text,
    shortcut,
    trigger,
    direction = 'bottom',
    align = 'center'
  }: Props = $props();

  let bubbleElement = $state<HTMLDivElement | null>(null);
  let bubbleStyle = $state('');
  let positioned = $state(false);

  async function reposition(): Promise<void> {
    if (!trigger || !bubbleElement || typeof window === 'undefined') {
      return;
    }

    await tick();

    const position = resolveCarbonTooltipPosition({
      triggerRect: trigger.getBoundingClientRect(),
      tooltipSize: {
        width: bubbleElement.offsetWidth,
        height: bubbleElement.offsetHeight
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

    bubbleStyle = styles.join('; ');
    positioned = true;
  }

  $effect(() => {
    void trigger;
    void text;
    void shortcut;
    void direction;
    void align;
    void reposition();
  });

  $effect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleViewportChange = () => {
      void reposition();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<div use:portal class="khartis-carbon-tooltip-portal">
  <div
    bind:this={bubbleElement}
    class="khartis-carbon-tooltip khartis-carbon-tooltip--{direction}"
    class:khartis-carbon-tooltip--placed={positioned}
    style={bubbleStyle}
    role="tooltip"
  >
    {text}{#if shortcut}<span
        class="khartis-tooltip-keys"
        class:khartis-tooltip-keys--after-text={text}
        >{#each splitShortcutKeys(shortcut) as key (key)}<kbd>{key}</kbd
          >{/each}</span
      >{/if}
  </div>
</div>

<style>
  :global(.khartis-carbon-tooltip-portal) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: var(--z-overlay);
  }

  :global(.khartis-carbon-tooltip) {
    position: fixed;
    z-index: var(--z-popover);
    width: max-content;
    min-width: 1.5rem;
    max-width: 13rem;
    padding: 0.1875rem 1rem;
    background-color: var(--cds-inverse-02, #393939);
    border-radius: 0.125rem;
    color: var(--cds-inverse-01, #ffffff);
    box-shadow: 0 2px 6px var(--cds-shadow, rgba(0, 0, 0, 0.3));
    font-size: var(--cds-body-short-01-font-size, 0.875rem);
    font-weight: var(--cds-body-short-01-font-weight, 400);
    line-height: var(--cds-body-short-01-line-height, 1.28572);
    letter-spacing: var(--cds-body-short-01-letter-spacing, 0.16px);
    text-align: left;
    word-break: break-word;
    /* Measured before it is placed; revealing it early flashes it at the origin. */
    visibility: hidden;
  }

  :global(.khartis-tooltip-keys) {
    display: inline-flex;
    gap: 0.125rem;
    vertical-align: baseline;
  }

  :global(.khartis-tooltip-keys--after-text) {
    margin-inline-start: 0.5rem;
  }

  :global(.khartis-tooltip-keys kbd) {
    min-width: 1.25rem;
    padding: 0 0.3125rem;
    border: 1px solid currentColor;
    border-radius: 0.1875rem;
    box-shadow: 0 1px 0 currentColor;
    font-family: inherit;
    font-size: 0.75rem;
    line-height: 1.25;
    text-align: center;
    opacity: 0.85;
  }

  :global(.khartis-carbon-tooltip--placed) {
    visibility: visible;
  }

  :global(.khartis-carbon-tooltip::before) {
    position: absolute;
    width: 0;
    height: 0;
    border-style: solid;
    content: '';
  }

  :global(.khartis-carbon-tooltip--top::before) {
    bottom: -0.25rem;
    left: var(--khartis-tooltip-caret-left);
    transform: translateX(-50%);
    border-width: 0.25rem 0.3125rem 0;
    border-color: var(--cds-inverse-02, #393939) transparent transparent;
  }

  :global(.khartis-carbon-tooltip--bottom::before) {
    top: -0.25rem;
    left: var(--khartis-tooltip-caret-left);
    transform: translateX(-50%);
    border-width: 0 0.3125rem 0.25rem;
    border-color: transparent transparent var(--cds-inverse-02, #393939);
  }

  :global(.khartis-carbon-tooltip--left::before) {
    top: var(--khartis-tooltip-caret-top);
    right: -0.3125rem;
    transform: translateY(-50%);
    border-width: 0.3125rem 0 0.3125rem 0.25rem;
    border-color: transparent transparent transparent
      var(--cds-inverse-02, #393939);
  }

  :global(.khartis-carbon-tooltip--right::before) {
    top: var(--khartis-tooltip-caret-top);
    left: -0.3125rem;
    transform: translateY(-50%);
    border-width: 0.3125rem 0.25rem 0.3125rem 0;
    border-color: transparent var(--cds-inverse-02, #393939) transparent
      transparent;
  }
</style>
