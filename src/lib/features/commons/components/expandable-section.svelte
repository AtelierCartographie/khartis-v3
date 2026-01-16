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
    toggleDisabled?: boolean;
    disabled?: boolean;
    disabledReason?: string;
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
    toggleDisabled = false,
    disabled = false,
    disabledReason,
    onToggleChange
  }: Props = $props();

  const isControlled = Boolean(onToggleChange);
  let internalToggleChecked = $state<boolean>(toggleChecked);
  const effectiveToggleChecked = $derived(
    isControlled ? toggleChecked : internalToggleChecked
  );

  let expanded = $state<boolean>(untrack(() => defaultOpen));
  let prevToggleChecked = $state<boolean>(effectiveToggleChecked);

  $effect(() => {
    if (showToggle && prevToggleChecked !== effectiveToggleChecked) {
      prevToggleChecked = effectiveToggleChecked;
      expanded = effectiveToggleChecked;
    }
  });

  const dispatch = createEventDispatcher<{ toggle: { expanded: boolean } }>();

  function toggle(): void {
    if (disabled) return;
    if (showToggle && !effectiveToggleChecked) return;
    expanded = !expanded;
    dispatch('toggle', { expanded });
  }

  function handleToggleChange(event: CustomEvent): void {
    event.stopPropagation();
    const newValue = event.detail.toggled;
    if (isControlled) {
      onToggleChange?.(newValue);
    } else {
      internalToggleChecked = newValue;
    }
  }
</script>

<div class="section-container" class:disabled={disabled}>
  <div
    class="section-header"
    class:expanded={expanded && !disabled}
    class:collapsed={!expanded || disabled}
    class:disabled={disabled}
    role="button"
    tabindex={disabled ? -1 : 0}
    aria-expanded={expanded && !disabled}
    aria-disabled={disabled}
    aria-label={m.section_toggle()}
    title={disabled && disabledReason ? disabledReason : undefined}
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
          toggled={effectiveToggleChecked}
          disabled={toggleDisabled || disabled}
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

    <span
      class="section-chevron"
      class:toggle-off={showToggle && !effectiveToggleChecked}
      aria-hidden="true"
    >
      {#if expanded}
        <ChevronDown />
      {:else}
        <ChevronRight />
      {/if}
    </span>
  </div>

  {#if expanded && !disabled}
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

  .section-chevron.toggle-off {
    opacity: 0.4;
  }

  .section-body {
    padding: var(--cds-spacing-03);
    background-color: var(--cds-ui-02);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .section-header:hover:not(.disabled) {
    background-color: var(--cds-hover-ui);
  }

  .section-header.expanded .section-title {
    color: var(--cds-link-02);
  }

  .section-header:active:not(.disabled) .section-title {
    color: var(--cds-link-02);
  }

  .section-container.disabled {
    opacity: 0.5;
  }

  .section-header.disabled {
    cursor: not-allowed;
  }

  .section-header.disabled .section-title {
    color: var(--cds-text-disabled);
  }

  .section-header.disabled .section-chevron {
    color: var(--cds-icon-disabled);
  }
</style>
