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
    onDoubleClick?: (index: number) => void;
    className?: string;
    activeClass?: string;
    fullWidthClass?: string;
    hideInactiveLabel?: boolean;
    tabTitle?: (index: number, isActive: boolean) => string | undefined;
  }

  let {
    activeIndex = 0,
    items = [],
    onChange = () => {},
    onDoubleClick,
    className = '',
    activeClass = 'active',
    fullWidthClass = 'full-width',
    hideInactiveLabel = true,
    tabTitle
  }: Props = $props();

  function handleClick(index: number): void {
    onChange(index);
  }

  function handleDoubleClick(index: number): void {
    onDoubleClick?.(index);
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
      title={tabTitle?.(index, activeIndex === index)}
      onclick={() => handleClick(index)}
      ondblclick={() => handleDoubleClick(index)}
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
    border-radius: 4px;
    width: 100%;
  }

  .toggle-tab {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 32px;
    padding: 0 8px;
    background: transparent;
    color: var(--cds-text-secondary);
    fill: currentColor;
    border: 1px solid #cac5c4;
    border-right: none;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    font-weight: 400;
    letter-spacing: 0.16px;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .toggle-tab:last-child {
    border-right: 1px solid #cac5c4;
    border-radius: 0 4px 4px 0;
  }

  .toggle-tab:first-child {
    border-radius: 4px 0 0 4px;
  }

  .toggle-tab.full-width {
    flex: 1 0 0;
    justify-content: flex-start;
    padding: 0 16px;
  }

  .toggle-tab:not(.full-width) {
    width: 32px;
    padding: 0;
  }

  .toggle-tab.active {
    color: var(--cds-text-primary);
    background-color: #cac5c4;
    border-color: #cac5c4;
    z-index: var(--z-base);
  }

  .toggle-tab:not(.active) {
    color: var(--cds-text-secondary);
  }

  .toggle-tab:hover:not(.active) {
    background-color: var(--cds-layer-hover-01);
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
