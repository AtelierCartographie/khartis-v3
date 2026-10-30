<script lang="ts">
  import Button from '$lib/features/commons/components/carbon/button.svelte';
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import * as m from '$lib/paraglide/messages';
  import { Close, TrashCan } from 'carbon-icons-svelte';
  import { annotationsActions } from '../annotations.store.svelte';

  interface Props {
    /** « Texte sélectionné », or « Nouveau texte » when nothing is. */
    title: string;
    /** The selected item, as the user knows it (Titre, Flèche, Zone…). */
    name?: string;
    deleteLabel: string;
    ondelete?: () => void;
  }

  const { title, name, deleteLabel, ondelete }: Props = $props();

  const hasSelection = $derived(!!ondelete);
</script>

<section class="selection-header" class:has-selection={hasSelection}>
  <div class="selection-heading">
    <p class="selection-title">{title}</p>
    {#if hasSelection}
      <IconButton
        kind="ghost"
        size="small"
        icon={Close}
        iconDescription={m.annotations_deselect()}
        tooltipPosition="left"
        onclick={() => annotationsActions.selectAnnotation(null)}
      />
    {/if}
  </div>

  {#if hasSelection}
    {#if name}
      <p class="selection-name" title={name}>{name}</p>
    {/if}
    <div class="selection-actions">
      <Button
        size="small"
        kind="danger-tertiary"
        icon={TrashCan}
        onclick={ondelete}
      >
        {deleteLabel}
      </Button>
    </div>
  {:else}
    <p class="kh-help">{m.annotations_next_item_settings()}</p>
  {/if}
</section>

<style>
  /* Says what the settings below act on: the selected item, with its Delete
     button ahead of them, or the next item to be placed. */
  .selection-header {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-label);
    padding: var(--cds-spacing-03) var(--cds-spacing-03) var(--cds-spacing-04)
      var(--cds-spacing-04);
    background: var(--cds-layer-01);
    border-left: 3px solid var(--cds-border-subtle-01);
  }

  .selection-header.has-selection {
    border-left-color: var(--cds-border-interactive);
  }

  .selection-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--kh-gap-inline);
    min-height: var(--kh-size-sm);
  }

  .selection-title {
    margin: 0;
    color: var(--cds-text-secondary);
    font-size: var(--kh-font-label);
    line-height: var(--kh-line-label);
    letter-spacing: 0.32px;
  }

  .selection-name {
    margin: 0;
    overflow: hidden;
    color: var(--cds-text-primary);
    font-size: var(--kh-font-primitive);
    font-weight: var(--kh-weight-primitive);
    line-height: var(--kh-line-primitive);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selection-actions {
    padding-top: var(--kh-gap-label);
  }
</style>
