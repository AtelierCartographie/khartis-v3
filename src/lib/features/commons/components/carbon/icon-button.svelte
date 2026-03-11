<script lang="ts">
  import Button from './button.svelte';
  import type {
    CarbonTooltipAlignment,
    CarbonTooltipDirection
  } from '$lib/features/commons/utils/carbon-tooltip-position';

  interface Props extends Record<string, unknown> {
    icon: unknown;
    iconDescription?: string;
    tooltipPosition?: CarbonTooltipDirection;
    tooltipAlignment?: CarbonTooltipAlignment;
    hideTooltip?: boolean;
    disabled?: boolean;
  }

  const { ...restProps }: Props = $props();
</script>

<Button
  {...restProps}
  on:click
  on:focus
  on:blur
  on:mouseenter
  on:mouseleave
  on:mouseover
/>
