<script lang="ts">
  import { ChevronDown, ChevronUp } from 'carbon-icons-svelte';
  import type { Snippet } from 'svelte';
  import { onDestroy, tick, untrack } from 'svelte';
  import { stopBubbleEvents } from '$lib/features/commons/utils/stop-bubble-events';
  import Switch from './switch.svelte';

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
    scrollIntoViewOnOpen?: boolean;
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
    actionsEnd = false,
    scrollIntoViewOnOpen = false
  }: Props = $props();

  const REVEAL_SETTLE_DELAYS_MS = [0, 80, 200, 400];

  let containerElement = $state<HTMLDivElement | undefined>(undefined);
  let revealTimers: ReturnType<typeof setTimeout>[] = [];
  let revealScroller: HTMLElement | undefined;

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
    revealHeader();
  }

  function findScrollableAncestor(
    element: HTMLElement
  ): HTMLElement | undefined {
    let parent = element.parentElement;

    while (parent) {
      const { overflowY } = getComputedStyle(parent);
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        parent.scrollHeight > parent.clientHeight
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }

    return undefined;
  }

  function alignContainerToScrollerTop(): void {
    const container = containerElement;
    if (!container || !expanded) return;

    const scroller = findScrollableAncestor(container);
    if (!scroller) return;

    // The header is sticky, so scrollIntoView reads it as already in place
    // once it is pinned; the container is the only reliable anchor.
    const delta =
      container.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top;

    if (Math.abs(delta) < 1) return;

    scroller.scrollTop += delta;
  }

  function cancelReveal(): void {
    for (const timer of revealTimers) {
      clearTimeout(timer);
    }
    revealTimers = [];

    revealScroller?.removeEventListener('wheel', cancelReveal);
    revealScroller?.removeEventListener('touchstart', cancelReveal);
    revealScroller = undefined;
  }

  function revealHeader(): void {
    if (!expanded || !scrollIntoViewOnOpen) return;

    cancelReveal();

    void tick().then(() => {
      const container = containerElement;
      if (!container || !expanded) return;

      revealScroller = findScrollableAncestor(container);
      revealScroller?.addEventListener('wheel', cancelReveal, {
        passive: true
      });
      revealScroller?.addEventListener('touchstart', cancelReveal, {
        passive: true
      });

      // The sibling that closes and this section's own body settle over
      // several update cycles, so a single measure lands on a layout that is
      // still moving under it.
      revealTimers = REVEAL_SETTLE_DELAYS_MS.map((delay) =>
        setTimeout(alignContainerToScrollerTop, delay)
      );
    });
  }

  onDestroy(cancelReveal);

  function handleToggleChange(toggled: boolean): void {
    expanded = toggled;
    onToggle?.(expanded);
    onToggleChange?.(toggled);
    revealHeader();
  }
</script>

<div
  bind:this={containerElement}
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

    {#if icon && actionsEnd}
      <span
        class="section-custom-icon section-actions-end"
        class:disabled={disabled}
        inert={disabled}
        role="presentation"
      >
        {@render icon()}
      </span>
    {/if}
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
    background-color: var(
      --khartis-expandable-section-background,
      var(--cds-layer-01)
    );
    position: sticky;
    top: 0;
    z-index: 5;
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
    gap: var(--kh-gap-group);
    flex: 1;
    min-width: 0;
    min-height: var(--kh-size-lg);
    padding: 0 var(--kh-pad-panel);
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
  }

  .section-expand-btn:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: -2px;
  }

  .section-header.has-toggle .section-expand-btn {
    padding-left: 0;
  }

  .section-toggle {
    display: flex;
    align-items: center;
    min-height: var(--kh-size-lg);
    padding: 0 var(--cds-spacing-03) 0 var(--kh-pad-panel);
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
    font-weight: var(--kh-weight-primitive);
    font-size: var(--kh-font-primitive);
    line-height: var(--kh-line-primitive);
    letter-spacing: 0.16px;
    color: var(--cds-text-primary);
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .section-description {
    font-size: var(--kh-font-label);
    line-height: var(--kh-line-label);
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
    margin-right: 16px;
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
