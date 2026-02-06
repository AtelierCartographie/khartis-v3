<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { Toggle } from 'carbon-components-svelte';
  import { ChevronDown, ChevronRight } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';

  interface Props {
    title: string;
    description?: string;
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
    onToggle?: (expanded: boolean) => void;
    titleClass?: string;
  }

  const {
    title,
    description,
    defaultOpen = false,
    count,
    children,
    icon,
    showToggle = false,
    toggleChecked = false,
    toggleDisabled = false,
    disabled = false,
    disabledReason,
    onToggleChange,
    onToggle,
    titleClass = ''
  }: Props = $props();

  const isControlled = $derived(Boolean(onToggleChange));
  let internalToggleChecked = $state<boolean>(false);
  const effectiveToggleChecked = $derived(
    isControlled ? toggleChecked : internalToggleChecked
  );

  let expanded = $state<boolean>(untrack(() => defaultOpen));
  let prevToggleChecked = $state<boolean>(false);

  $effect(() => {
    if (!isControlled && toggleChecked !== internalToggleChecked) {
      internalToggleChecked = toggleChecked;
    }
  });

  $effect(() => {
    if (showToggle && prevToggleChecked !== effectiveToggleChecked) {
      prevToggleChecked = effectiveToggleChecked;
      expanded = effectiveToggleChecked;
    }
  });

  function toggle(): void {
    if (disabled) return;
    if (showToggle && !effectiveToggleChecked) return;
    expanded = !expanded;
    onToggle?.(expanded);
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

    <div class="section-title-group">
      <span class="section-title {titleClass}">
        {title}{count !== undefined ? ` (${count})` : ''}

        {#if icon}
          <span
            class="section-custom-icon"
            onclick={(e: MouseEvent) => e.stopPropagation()}
            onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
            role="presentation"
          >
            {@render icon()}
          </span>
        {/if}
      </span>
      {#if description}
        <span class="section-description">{description}</span>
      {/if}
    </div>

    <span
      class="section-chevron"
      class:toggle-off={showToggle && !effectiveToggleChecked}
      aria-hidden="true"
    >
      {#if expanded}
        <ChevronDown size={16} />
      {:else}
        <ChevronRight size={16} />
      {/if}
    </span>
  </div>

  {#if expanded && !disabled}
    <div class="section-body">
      {@render children?.()}
    </div>
  {/if}
</div>

<style lang="scss">
  .section-container {
    border-top: 1px solid var(--cds-border-subtle-00, #e0e0e0);
    background: transparent;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 16px;
    background-color: var(--cds-layer-01);
    cursor: pointer;
    user-select: none;
  }

  .section-header.collapsed {
    background-color: var(--cds-layer-01);
  }

  .section-title-group {
    flex: 1 0 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .section-title {
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary);
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .section-description {
    font-size: 0.6875rem;
    line-height: 1rem;
    color: var(--cds-text-secondary);
    font-weight: 400;
  }

  .section-custom-icon {
    display: flex;
    align-items: center;
    margin-left: var(--cds-spacing-02);
  }

  .section-toggle {
    display: flex;
    align-items: center;
    margin-right: var(--cds-spacing-02);
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
    color: var(--cds-icon-primary);
  }

  .section-chevron.toggle-off {
    opacity: 0.4;
  }

  .section-body {
    background-color: var(--cds-layer-01);
    border-top: 1px solid var(--cds-border-subtle-01);
    padding: 8px 16px 16px 16px;
  }

  .section-header:hover:not(.disabled) {
    background-color: var(--cds-layer-hover-01);
  }

  .section-header.expanded .section-title {
    color: var(--cds-text-primary);
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
