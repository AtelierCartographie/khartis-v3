<script lang="ts">
  import { Button as CarbonButton } from 'carbon-components-svelte';
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import { portal } from '$lib/features/commons/utils/portal';
  import {
    resolveCarbonTooltipPosition,
    type CarbonTooltipAlignment,
    type CarbonTooltipDirection
  } from '$lib/features/commons/utils/carbon-tooltip-position';
  import { KEY, EVENT } from '$lib/features/commons/constants/dom.constants';

  interface Props extends Record<string, unknown> {
    children?: Snippet;
    iconDescription?: string;
    tooltipPosition?: CarbonTooltipDirection;
    tooltipAlignment?: CarbonTooltipAlignment;
    hideTooltip?: boolean;
    portalTooltip?: boolean;
    showDisabledTooltip?: boolean;
    disabled?: boolean;
    icon?: unknown;
  }

  const {
    children,
    iconDescription,
    tooltipPosition = 'bottom',
    tooltipAlignment = 'center',
    hideTooltip = false,
    portalTooltip = false,
    showDisabledTooltip = false,
    disabled = false,
    icon = undefined,
    ...restProps
  }: Props = $props();

  let triggerElement = $state<HTMLAnchorElement | HTMLButtonElement | null>(
    null
  );
  let tooltipElement = $state<HTMLDivElement | null>(null);
  let tooltipOpen = $state(false);
  let tooltipStyle = $state('');

  const canShowPortalTooltip = $derived(
    typeof window !== 'undefined' &&
      Boolean(iconDescription) &&
      Boolean(icon) &&
      !hideTooltip &&
      (portalTooltip || !children) &&
      (!disabled || showDisabledTooltip)
  );

  async function updateTooltipPosition() {
    if (
      !triggerElement ||
      !tooltipElement ||
      typeof window === 'undefined' ||
      !canShowPortalTooltip
    ) {
      return;
    }

    await tick();

    const position = resolveCarbonTooltipPosition({
      triggerRect: triggerElement.getBoundingClientRect(),
      tooltipSize: {
        width: tooltipElement.offsetWidth,
        height: tooltipElement.offsetHeight
      },
      direction: tooltipPosition,
      align: tooltipAlignment,
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

  async function showTooltip() {
    if (!canShowPortalTooltip) {
      return;
    }

    tooltipOpen = true;
    await updateTooltipPosition();
  }

  function hideTooltipOverlay() {
    tooltipOpen = false;
  }

  function handleMouseEnter() {
    void showTooltip();
  }

  function handleFocus() {
    void showTooltip();
  }

  $effect(() => {
    if (!tooltipOpen) {
      return;
    }

    void tooltipPosition;
    void tooltipAlignment;
    void iconDescription;
    void updateTooltipPosition();
  });

  $effect(() => {
    if (
      !tooltipOpen ||
      !canShowPortalTooltip ||
      typeof window === 'undefined'
    ) {
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
    if (!canShowPortalTooltip && tooltipOpen) {
      tooltipOpen = false;
    }
  });

  $effect(() => {
    if (!tooltipOpen || !canShowPortalTooltip) {
      return;
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key !== KEY.ESCAPE) {
        return;
      }

      tooltipOpen = false;
      triggerElement?.focus();
    }

    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
    };
  });
</script>

{#if children}
  <CarbonButton
    bind:ref={triggerElement}
    {...restProps}
    disabled={disabled}
    icon={icon}
    iconDescription={iconDescription}
    tooltipPosition={tooltipPosition}
    tooltipAlignment={tooltipAlignment}
    hideTooltip={canShowPortalTooltip || hideTooltip}
    on:click
    on:focus
    on:blur
    on:mouseenter
    on:mouseleave
    on:mouseover
    on:focus={handleFocus}
    on:blur={hideTooltipOverlay}
    on:mouseenter={handleMouseEnter}
    on:mouseleave={hideTooltipOverlay}
  >
    {@render children()}
  </CarbonButton>
{:else}
  <CarbonButton
    bind:ref={triggerElement}
    {...restProps}
    disabled={disabled}
    icon={icon}
    iconDescription={iconDescription}
    tooltipPosition={tooltipPosition}
    tooltipAlignment={tooltipAlignment}
    hideTooltip={canShowPortalTooltip || hideTooltip}
    on:click
    on:focus
    on:blur
    on:mouseenter
    on:mouseleave
    on:mouseover
    on:focus={handleFocus}
    on:blur={hideTooltipOverlay}
    on:mouseenter={handleMouseEnter}
    on:mouseleave={hideTooltipOverlay}
  />
{/if}

{#if tooltipOpen && canShowPortalTooltip}
  <div use:portal class="khartis-carbon-tooltip-portal">
    <div
      bind:this={tooltipElement}
      class="khartis-carbon-tooltip khartis-carbon-tooltip--{tooltipPosition}"
      style={tooltipStyle}
      role="tooltip"
    >
      {iconDescription}
    </div>
  </div>
{/if}

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
