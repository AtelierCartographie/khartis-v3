<script lang="ts">
  import { ChevronDown, ChevronUp } from 'carbon-icons-svelte';
  import type { Component } from 'svelte';

  interface SectionHeaderWithIconProps {
    title: string;
    subtitle?: string;
    icon?: Component;
    collapsible?: boolean;
    defaultOpen?: boolean;
  }

  let {
    title,
    subtitle,
    icon,
    collapsible = false,
    defaultOpen = true
  }: SectionHeaderWithIconProps = $props();

  let expanded = $state(defaultOpen);

  function toggleExpanded() {
    if (collapsible) {
      expanded = !expanded;
    }
  }
</script>

<button
  class="section-header-with-icon"
  class:collapsible={collapsible}
  type="button"
  disabled={!collapsible}
  aria-expanded={collapsible ? expanded : undefined}
  onclick={collapsible ? toggleExpanded : undefined}
  onkeydown={(event: KeyboardEvent) => {
    if (collapsible && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      toggleExpanded();
    }
  }}
>
  <div class="header-content">
    {#if icon}
      {@const Icon = icon}
      <div class="header-icon">
        <Icon size={20} />
      </div>
    {/if}
    <h3 class="header-title">{title}</h3>
    {#if collapsible}
      {@const ChevronIcon = expanded ? ChevronUp : ChevronDown}
      <div class="chevron-icon">
        <ChevronIcon size={16} />
      </div>
    {/if}
  </div>
  {#if subtitle && expanded}
    <p class="header-subtitle">{subtitle}</p>
  {/if}
</button>

<style>
  .section-header-with-icon {
    margin-bottom: var(--cds-spacing-05);
  }

  .section-header-with-icon.collapsible {
    cursor: pointer;
    user-select: none;
  }

  .section-header-with-icon.collapsible:focus {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .header-icon {
    display: flex;
    align-items: center;
    color: var(--cds-icon-primary);
  }

  .header-icon :global(svg) {
    fill: var(--cds-interactive-01);
  }

  .header-title {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    line-height: 1.4;
  }

  .chevron-icon {
    display: flex;
    align-items: center;
    color: var(--cds-icon-secondary);
    transition: transform 0.2s ease;
  }

  .section-header-with-icon.collapsible:hover .chevron-icon {
    color: var(--cds-icon-primary);
  }

  .header-subtitle {
    margin: var(--cds-spacing-03) 0 0 calc(20px + var(--cds-spacing-03));
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    line-height: 1.4;
  }

  /* Animation for chevron */
  .collapsible:hover .header-content {
    opacity: 0.9;
  }
</style>
