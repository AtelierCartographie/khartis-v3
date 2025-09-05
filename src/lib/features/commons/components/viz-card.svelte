<script lang="ts">
  import { RadioButton } from 'carbon-components-svelte';
  import { Switcher } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { createEventDispatcher } from 'svelte';

  interface Props {
    id: string;
    title: string;
    subtitle?: string;
    tags?: string[];
    ratio?: string; // e.g. 1:1 label at left
    selected?: boolean;
    radioName?: string;
  }

  const {
    id,
    title,
    subtitle,
    tags = [],
    ratio = '1:1',
    selected = false,
    radioName = 'viz-card'
  }: Props = $props();

  const dispatch = createEventDispatcher<{ select: { selected: string } }>();

  function onSelect() {
    dispatch('select', { selected: id });
  }
</script>

<button
  type="button"
  class={clsx('viz-card', selected && 'selected')}
  onclick={onSelect}
>
  <div class="preview">
    <Switcher size={24} />
    <div class="ratio">{ratio}</div>
    <div class="preview-label">Viz preview</div>
  </div>

  <div class="meta">
    <div class="titles">
      <div class="title">{title}</div>
      {#if subtitle}
        <div class="subtitle">{subtitle}</div>
      {/if}
    </div>

    <div class="tags">
      {#each tags as t}
        <span class="tag">{t}</span>
      {/each}
    </div>
  </div>

  <div class="select">
    <RadioButton
      name={radioName}
      checked={selected}
      value={id}
      on:change={onSelect}
      labelText=""
      hideLabel
    />
  </div>
</button>

<style>
  .viz-card {
    display: grid;
    grid-template-columns: 120px 1fr auto;
    gap: var(--cds-spacing-05);
    align-items: center;
    padding: var(--cds-spacing-05);
    border: 1px solid var(--cds-border-subtle);
    background: var(--cds-ui-01);
    border-radius: 4px;
    cursor: pointer;
    outline: none;
  }

  .viz-card:hover {
    background: var(--cds-hover-ui);
  }

  .viz-card.selected {
    outline: 2px solid var(--cds-link-02);
    outline-offset: -2px;
    background: color-mix(in oklab, var(--cds-link-02) 6%, var(--cds-ui-01));
  }

  .preview {
    display: grid;
    grid-template-rows: auto auto;
    align-items: center;
    justify-items: center;
    color: var(--cds-link-02);
    padding: var(--cds-spacing-04);
    border-right: 1px solid var(--cds-border-subtle);
    height: 100%;
  }

  .ratio {
    margin-top: var(--cds-spacing-03);
    font-weight: 600;
  }

  .preview-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .meta {
    display: grid;
    gap: var(--cds-spacing-03);
  }

  .titles {
    display: flex;
    gap: var(--cds-spacing-02);
    align-items: baseline;
  }

  .title {
    font-weight: 600;
  }

  .subtitle {
    color: var(--cds-text-02);
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-02);
  }

  .tag {
    border: 1px dashed var(--cds-border-strong);
    border-radius: 999px;
    padding: 0 var(--cds-spacing-03);
    height: 24px;
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    background: var(--cds-ui-background);
  }

  .select :global(.bx--radio-button__label) {
    display: none;
  }
</style>
