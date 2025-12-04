<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Toggle } from 'carbon-components-svelte';
  import { ChevronDown, ChevronRight } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';
  import { createEventDispatcher, untrack } from 'svelte';

  interface Props {
    title: string;
    defaultOpen?: boolean;
    count?: number;
    children?: Snippet;
    icon?: Snippet;
    showToggle?: boolean;
    toggleChecked?: boolean;
    onToggleChange?: (checked: boolean) => void;
  }

  const {
    title,
    defaultOpen = false,
    count,
    children,
    icon,
    showToggle = false,
    toggleChecked = false,
    onToggleChange
  }: Props = $props();

  let expanded = $state<boolean>(untrack(() => defaultOpen));

  const dispatch = createEventDispatcher<{ toggle: { expanded: boolean } }>();

  function toggle(): void {
    expanded = !expanded;
    dispatch('toggle', { expanded });
  }

  function handleToggleChange(event: CustomEvent): void {
    event.stopPropagation();
    onToggleChange?.(event.detail.toggled);
  }
</script>

<div class="section-container">
  <div
    class="section-header"
    class:expanded={expanded}
    class:collapsed={!expanded}
    role="button"
    tabindex="0"
    aria-expanded={expanded}
    aria-label={m.section_toggle()}
    onclick={toggle}
    onkeydown={(e: KeyboardEvent) =>
      (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
  >
    {#if showToggle}
      <div
        class="section-toggle"
        role="presentation"
        onclick={(e: MouseEvent) => e.stopPropagation()}
        onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
      >
        <Toggle
          size="sm"
          toggled={toggleChecked}
          on:toggle={handleToggleChange}
          hideLabel
          labelA=""
          labelB=""
        />
      </div>
    {/if}

    <span class="section-title">
      {title}{count !== undefined ? ` (${count})` : ''}

      {#if icon}
        <span class="section-custom-icon">
          {@render icon()}
        </span>
      {/if}
    </span>

    <div class="section-actions"></div>

    <span class="section-chevron" aria-hidden="true">
      {#if expanded}
        <ChevronDown />
      {:else}
        <ChevronRight />
      {/if}
    </span>
  </div>

  {#if expanded}
    <div class="section-body">
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .section-container {
    border: 1px solid var(--cds-border-subtle);
    margin-bottom: var(--cds-spacing-05);
    border-radius: 2px;
    overflow: hidden;
    background: transparent;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04) var(--cds-spacing-05);
    background-color: var(--cds-ui-01);
    cursor: pointer;
    user-select: none;
    height: 48px;
  }

  .section-header.collapsed {
    background-color: var(--cds-ui-02);
  }

  .section-title {
    flex: 1;
    font-weight: 500;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .section-custom-icon {
    display: flex;
    align-items: center;
    margin-left: var(--cds-spacing-02);
  }

  .section-actions {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .section-toggle {
    display: flex;
    align-items: center;
    margin-right: var(--cds-spacing-03);
  }

  .section-toggle :global(.bx--toggle) {
    margin: 0;
  }

  .section-toggle :global(.bx--toggle-input:focus + .bx--toggle__switch) {
    outline: none;
    box-shadow: 0 0 0 1px var(--cds-focus);
  }

  .section-toggle :global(.bx--toggle__label) {
    display: none;
  }

  .section-chevron {
    display: flex;
    align-items: center;
    color: var(--cds-icon-01);
    margin-left: var(--cds-spacing-03);
  }

  .section-body {
    padding: var(--cds-spacing-03);
    background-color: var(--cds-ui-02);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .section-header:hover {
    background-color: var(--cds-hover-ui);
  }

  .section-header.expanded .section-title {
    color: var(--cds-link-02);
  }

  .section-header:active .section-title {
    color: var(--cds-link-02);
  }
</style>
