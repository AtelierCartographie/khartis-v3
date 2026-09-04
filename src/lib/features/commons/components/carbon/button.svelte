<script lang="ts">
  import { Button as CarbonButton } from 'carbon-components-svelte';
  import type { Snippet } from 'svelte';
  import TooltipBubble from './tooltip-bubble.svelte';
  import type {
    CarbonTooltipAlignment,
    CarbonTooltipDirection
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
  let tooltipOpen = $state(false);

  const canShowPortalTooltip = $derived(
    typeof window !== 'undefined' &&
      Boolean(iconDescription) &&
      Boolean(icon) &&
      !hideTooltip &&
      (portalTooltip || !children) &&
      (!disabled || showDisabledTooltip)
  );

  function showTooltip() {
    if (!canShowPortalTooltip) {
      return;
    }

    tooltipOpen = true;
  }

  function hideTooltipOverlay() {
    tooltipOpen = false;
  }

  function handleMouseEnter() {
    showTooltip();
  }

  function handleFocus() {
    showTooltip();
  }

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
  <TooltipBubble
    text={iconDescription ?? ''}
    trigger={triggerElement}
    direction={tooltipPosition}
    align={tooltipAlignment}
  />
{/if}
