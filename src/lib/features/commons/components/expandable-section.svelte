<script lang="ts">
  import { ChevronDown, ChevronUp } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import Switch from './switch.svelte';
  import { KEY } from '../constants/dom.constants';

  interface Props {
    title: string;
    description?: string;
    defaultOpen?: boolean;
    open?: boolean;
    count?: number;
    children?: Snippet;
    icon?: Snippet;
    showToggle?: boolean;
    toggleChecked?: boolean;
    toggleDisabled?: boolean;
    toggleVariant?: 'default' | 'suggestions';
    disabled?: boolean;
    disabledReason?: string;
    onToggleChange?: (checked: boolean) => void;
    onToggle?: (expanded: boolean) => void;
    titleClass?: string;
    actionsEnd?: boolean;
  }

  const {
    title,
    description,
    defaultOpen = false,
    open = undefined,
    count,
    children,
    icon,
    showToggle = false,
    toggleChecked = false,
    toggleDisabled = false,
    toggleVariant = 'default',
    disabled = false,
    disabledReason,
    onToggleChange,
    onToggle,
    titleClass = '',
    actionsEnd = false
  }: Props = $props();

  let expanded = $state<boolean>(
    untrack(() => (showToggle ? toggleChecked : defaultOpen))
  );

  $effect(() => {
    const checked = toggleChecked;
    if (!showToggle) return;
    expanded = checked;
  });

  $effect(() => {
    if (open !== undefined) {
      expanded = open;
    }
  });

  function toggle(): void {
    if (disabled) {
      return;
    }
    if (showToggle && !toggleChecked) {
      return;
    }
    expanded = !expanded;
    onToggle?.(expanded);
  }

  function stopBubbleEvents(node: HTMLElement) {
    const events = [
      'click',
      'mousedown',
      'mouseup',
      'pointerdown',
      'pointerup',
      'keydown',
      'keyup'
    ] as const;
    const handler = (event: Event) => event.stopPropagation();

    events.forEach((eventName) => {
      node.addEventListener(eventName, handler, { capture: true });
    });

    return {
      destroy() {
        events.forEach((eventName) => {
          node.removeEventListener(eventName, handler, { capture: true });
        });
      }
    };
  }

  function handleToggleChange(toggled: boolean): void {
    expanded = toggled;
    onToggle?.(expanded);
    onToggleChange?.(toggled);
  }
</script>

<div
  class="section-container"
  class:disabled={disabled}
  class:toggle-suggestions={toggleVariant === 'suggestions'}
>
  <div
    class="section-header"
    class:expanded={expanded && !disabled}
    class:collapsed={!expanded || disabled}
    class:disabled={disabled}
    class:has-toggle={showToggle}
  >
    {#if showToggle}
      <div class="section-toggle" use:stopBubbleEvents>
        <Switch
          toggled={toggleChecked}
          disabled={toggleDisabled || disabled}
          size="sm"
          variant={toggleVariant}
          hideLabel
          labelText={title}
          onchange={handleToggleChange}
        />
      </div>
    {/if}

    <button
      type="button"
      class="section-expand-btn"
      aria-expanded={expanded && !disabled}
      aria-disabled={disabled}
      title={disabled && disabledReason ? disabledReason : undefined}
      disabled={disabled}
      onclick={toggle}
      onkeydown={(e: KeyboardEvent) =>
        (e.key === KEY.ENTER || e.key === KEY.SPACE) &&
        (e.preventDefault(), toggle())}
    >
      <div class="section-title-group">
        <span class="section-title {titleClass}">
          {title}{count !== undefined ? ` (${count})` : ''}

          {#if icon && !actionsEnd}
            <span
              class="section-custom-icon"
              class:disabled={disabled}
              inert={disabled}
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

      {#if icon && actionsEnd}
        <span
          class="section-custom-icon section-actions-end"
          class:disabled={disabled}
          inert={disabled}
          onclick={(e: MouseEvent) => e.stopPropagation()}
          onkeydown={(e: KeyboardEvent) => e.stopPropagation()}
          role="presentation"
        >
          {@render icon()}
        </span>
      {/if}

      <span
        class="section-chevron"
        class:toggle-off={showToggle && !toggleChecked}
        aria-hidden="true"
      >
        {#if expanded}
          <ChevronUp size={16} />
        {:else}
          <ChevronDown size={16} />
        {/if}
      </span>
    </button>
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

  :global(
    .section-container:has(> .section-header.expanded) + .section-container
  ),
  :global(
    .section-container:has(> .section-header.expanded) + * + .section-container
  ) {
    border-top: none;
  }

  .section-header {
    display: flex;
    align-items: center;
    background-color: var(
      --khartis-expandable-section-background,
      var(--cds-layer-01)
    );
  }

  .section-header.collapsed {
    background-color: var(
      --khartis-expandable-section-background,
      var(--cds-layer-01)
    );
  }

  .section-expand-btn {
    all: unset;
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    min-width: 0;
    padding: 14px 16px;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
  }

  .section-header.has-toggle .section-expand-btn {
    padding-left: 0;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    padding: 14px var(--cds-spacing-03) 14px 16px;
    flex-shrink: 0;
  }

  .section-title-group {
    flex: 1 1 0;
    min-width: 0;
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
    gap: var(--cds-spacing-03);
    margin-left: var(--cds-spacing-02);
  }

  .section-custom-icon.section-actions-end {
    align-self: center;
    flex-shrink: 0;
    margin-left: 0;
  }

  .section-custom-icon.disabled {
    color: var(--cds-icon-disabled);
    pointer-events: none;
  }

  .section-custom-icon.disabled :global(button) {
    color: var(--cds-icon-disabled);
    cursor: not-allowed;
  }

  .section-chevron {
    display: flex;
    align-items: center;
    color: var(--cds-icon-primary);
    flex-shrink: 0;
  }

  .section-chevron.toggle-off {
    opacity: 0.4;
  }

  .section-body {
    background-color: var(
      --khartis-expandable-section-background,
      var(--cds-layer-01)
    );
    padding: var(--khartis-expandable-section-body-padding, 8px 16px 16px 16px);
  }

  .section-expand-btn:hover:not(:disabled) {
    background-color: var(
      --khartis-expandable-section-hover-background,
      var(--cds-layer-hover-01)
    );
  }

  .section-header:hover:not(.disabled) {
    background-color: var(
      --khartis-expandable-section-hover-background,
      var(--cds-layer-hover-01)
    );
  }

  .section-header.expanded .section-title {
    color: var(--cds-text-primary);
  }

  .section-container.disabled {
    opacity: 0.5;
  }

  .section-container.toggle-suggestions.disabled {
    opacity: 1;
  }

  .section-container.toggle-suggestions.disabled .section-custom-icon.disabled {
    opacity: 0.5;
  }

  .section-expand-btn:disabled {
    cursor: not-allowed;
  }

  .section-header.disabled .section-title {
    color: var(--cds-text-disabled);
  }

  .section-header.disabled .section-chevron {
    color: var(--cds-icon-disabled);
  }
</style>
