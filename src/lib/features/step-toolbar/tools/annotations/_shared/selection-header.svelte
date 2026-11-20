<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Tag } from 'carbon-components-svelte';
  import { annotationsActions } from '../annotations.store.svelte';

  interface Props {
    /** « Texte sélectionné », « Forme sélectionnée »… */
    label: string;
    /** The selected item, as the user knows it; absent when nothing is selected. */
    name?: string;
  }

  const { label, name }: Props = $props();
</script>

<div class="selection-row" class:is-empty={!name}>
  <span class="selection-label">{label}</span>
  {#if name}
    <Tag
      type="high-contrast"
      size="sm"
      filter
      maxWidth="14rem"
      title={m.annotations_deselect()}
      on:close={() => annotationsActions.selectAnnotation(null)}
    >
      {name}
    </Tag>
  {:else}
    <Tag size="sm" disabled>{m.annotations_no_selection()}</Tag>
  {/if}
</div>

<style>
  .selection-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--kh-gap-inline);
    min-height: var(--kh-size-sm);
  }

  .selection-label {
    flex-shrink: 0;
    color: var(--cds-text-secondary);
    font-size: var(--kh-font-body);
    line-height: var(--kh-line-body);
    letter-spacing: 0.16px;
  }

  .selection-row.is-empty .selection-label {
    color: var(--cds-text-disabled);
  }

  .selection-row :global(.bx--tag) {
    min-width: 0;
    margin: 0;
  }
</style>
