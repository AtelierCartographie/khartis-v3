<script lang="ts">
  import type { Component } from 'svelte';

  interface ToggleItem {
    icon?: Component;
    label: string;
    iconSize?: number;
  }

  interface Props {
    activeIndex?: number;
    items?: ToggleItem[];
    onChange?: (index: number) => void;
    className?: string;
    activeClass?: string;
    fullWidthClass?: string;
    hideInactiveLabel?: boolean;
  }

  let {
    activeIndex = 0,
    items = [],
    onChange = () => {},
    className = '',
    activeClass = 'active',
    fullWidthClass = 'full-width',
    hideInactiveLabel = true
  }: Props = $props();

  function handleClick(index: number): void {
    onChange(index);
  }
</script>

<div id="khartis-toggle-tabs" class="toggle-tabs {className}">
  {#each items as item, index (index)}
    <button
      class="toggle-tab {activeIndex === index
        ? activeClass
        : ''} {activeIndex === index ? fullWidthClass : ''} {index === 0 &&
      activeIndex === 0
        ? 'expand-right'
        : ''} {index === items.length - 1 && activeIndex === index
        ? 'expand-left'
        : ''}"
      onclick={() => handleClick(index)}
    >
      {#if item.icon}
        {@const Icon = item.icon}
        <Icon size={item.iconSize || 20} class="toggle-icon" />
      {/if}
      <span class:visually-hidden={hideInactiveLabel && activeIndex !== index}>
        {item.label}
      </span>
    </button>
  {/each}
</div>

<style>
  .toggle-tabs {
    display: flex;
    overflow: hidden;
    border: 1px solid var(--cds-ui-03);
    width: 100%;
  }

  .toggle-tab {
    position: relative;
    width: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 8px;
    background: var(--cds-background);
    color: var(--cds-text-secondary);
    fill: currentColor;
    border: none;
    font-size: 0.9em;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      color 0.2s ease,
      width 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
      padding 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  .toggle-tab.full-width {
    width: 180px;
    padding: 0 16px 0 12px;
  }

  .toggle-tab:not(.full-width) {
    width: 48px;
    padding: 0;
  }

  .toggle-tab.active {
    color: var(--cds-text-primary);
    background-color: var(--cds-ui-03);
    z-index: var(--z-base);
    flex: 1;
  }

  .toggle-tab:not(.active) {
    color: var(--cds-text-secondary);
  }

  .toggle-tab:hover:not(.active) {
    background-color: var(--cds-hover-ui);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  #khartis-toggle-tabs :global(.toggle-icon) {
    flex-shrink: 0;
  }

  .toggle-tab span {
    white-space: nowrap;
    transition: opacity 0.2s ease;
  }
</style>
