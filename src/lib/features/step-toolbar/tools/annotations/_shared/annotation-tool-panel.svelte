<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import { TrashCan } from 'carbon-icons-svelte';
  import type { Component, Snippet } from 'svelte';
  import SelectionHeader from './selection-header.svelte';

  interface Props {
    help: string;
    actionLabel: string;
    actionIcon: Component;
    onaction: () => void;
    selectionLabel: string;
    /** Name of the selected item of this kind, absent when none is. */
    selectedName?: string;
    deleteLabel: string;
    ondelete: () => void;
    creationOptions?: Snippet;
    /** Replaces the primary action, e.g. while a drawing is in progress. */
    actionOverride?: Snippet;
    instructions?: string;
    error?: string | null;
    properties?: Snippet;
  }

  const {
    help,
    actionLabel,
    actionIcon,
    onaction,
    selectionLabel,
    selectedName,
    deleteLabel,
    ondelete,
    creationOptions,
    actionOverride,
    instructions,
    error,
    properties
  }: Props = $props();

  const hasSelection = $derived(selectedName !== undefined);
</script>

<div class="annotation-tool">
  <p class="kh-help annotation-help">{help}</p>

  <div class="annotation-group">
    {@render creationOptions?.()}
    {#if actionOverride}
      {@render actionOverride()}
    {:else}
      <div class="full-width-action">
        <Button
          size="field"
          kind="primary"
          icon={actionIcon}
          disabled={hasSelection}
          onclick={onaction}
        >
          {actionLabel}
        </Button>
      </div>
      {#if instructions}
        <p class="kh-help">{instructions}</p>
      {/if}
    {/if}
    {#if error}
      <p class="kh-help annotation-error" role="alert">{error}</p>
    {/if}
  </div>

  <div class="annotation-group">
    <SelectionHeader label={selectionLabel} name={selectedName} />
    <div class="full-width-action">
      <Button
        size="field"
        kind="tertiary"
        icon={TrashCan}
        disabled={!hasSelection}
        onclick={ondelete}
      >
        {deleteLabel}
      </Button>
    </div>
  </div>

  {#if hasSelection && properties}
    <hr class="annotation-divider" />
    <div class="annotation-group">
      {@render properties()}
    </div>
  {/if}
</div>

<style>
  .annotation-tool,
  .annotation-group {
    display: flex;
    flex-direction: column;
  }

  .annotation-tool {
    gap: var(--kh-gap-group);
  }

  .annotation-group {
    gap: var(--kh-gap-param);
  }

  .annotation-help {
    white-space: pre-line;
  }

  .annotation-error {
    color: var(--cds-text-error);
  }

  .full-width-action :global(.bx--btn) {
    width: 100%;
    max-width: 100%;
  }

  .annotation-tool :global(.annotation-divider) {
    width: 100%;
    height: 1px;
    margin: 0;
    border: 0;
    background-color: var(--cds-border-subtle-01);
  }
</style>
