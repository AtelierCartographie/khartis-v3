<script lang="ts">
  import Calendar from 'carbon-icons-svelte/lib/Calendar.svelte';
  import Earth from 'carbon-icons-svelte/lib/Earth.svelte';
  import LocationFilled from 'carbon-icons-svelte/lib/LocationFilled.svelte';
  import {
    VARIABLE_BADGE_STYLES,
    type VariableBadgeType
  } from './variable-badge.types';

  interface Props {
    /** Display label (column/variable name) */
    label: string;
    /** Badge type determining colors and right-side indicator */
    type?: VariableBadgeType;
    /** Bindable reference to the underlying button element */
    element?: HTMLButtonElement;
    /** Click handler */
    onclick?: (e: MouseEvent) => void;
    onmouseenter?: (e: MouseEvent) => void;
    onmouseleave?: (e: MouseEvent) => void;
    onfocus?: (e: FocusEvent) => void;
    onblur?: (e: FocusEvent) => void;
    /** Accessible label for the badge */
    ariaLabel?: string;
  }

  let {
    label,
    type = 'string',
    element = $bindable(),
    onclick,
    onmouseenter,
    onmouseleave,
    onfocus,
    onblur,
    ariaLabel
  }: Props = $props();

  const style = $derived(VARIABLE_BADGE_STYLES[type]);
</script>

<button
  class="variable-badge"
  style="
    --badge-color: {style.color};
    --badge-bg: {style.bgColor};
    --badge-border: {style.borderColor};
  "
  bind:this={element}
  onclick={onclick}
  onmouseenter={onmouseenter}
  onmouseleave={onmouseleave}
  onfocus={onfocus}
  onblur={onblur}
  aria-label={ariaLabel}
>
  <span class="badge-label" title={label}>{label}</span>
  <span class="badge-divider"></span>
  {#if type === 'geo'}
    <span class="badge-icon">
      <Earth size={16} />
    </span>
  {:else if type === 'geo-ref'}
    <span class="badge-icon">
      <LocationFilled size={16} />
    </span>
  {:else if type === 'date'}
    <span class="badge-icon">
      <Calendar size={16} />
    </span>
  {:else if type === 'numeric'}
    <span class="badge-icon-text">123</span>
  {:else if type === 'string'}
    <span class="badge-icon-text">ABC</span>
  {/if}
</button>

<style>
  .variable-badge {
    display: inline-flex;
    align-items: center;
    min-width: 68px;
    max-width: 100%;
    height: 18px;
    padding: 0;
    border-radius: 1000px;
    background-color: var(--badge-bg);
    border: 1px solid var(--badge-border);
    color: var(--badge-color);
    cursor: pointer;
    overflow: hidden;
    flex: 1;
    transition: filter 0.15s;
  }

  .variable-badge:hover,
  .variable-badge:focus {
    filter: brightness(0.95);
    outline: none;
  }

  .badge-label {
    flex: 1;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px;
    font-weight: 400;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 6px 0 8px;
  }

  .badge-divider {
    width: 1px;
    height: 12px;
    background-color: var(--badge-border);
    flex-shrink: 0;
    opacity: 0.6;
  }

  .badge-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 3px 0 1px;
    flex-shrink: 0;
    color: inherit;
    transform: scale(0.75);
    transform-origin: center;
  }

  .badge-icon-text {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.32px;
    padding: 0 4px 0 2px;
    flex-shrink: 0;
    color: inherit;
  }
</style>
