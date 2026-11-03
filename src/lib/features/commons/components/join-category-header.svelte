<script lang="ts" module>
  export type JoinCategoryTone =
    'success' | 'warning' | 'error' | 'ignored' | 'missing';
</script>

<script lang="ts">
  import type { Component } from 'svelte';
  import { ChevronDown, ChevronUp } from 'carbon-icons-svelte';
  import { formatValue } from '$lib/features/commons/utils/format.utils';

  interface Props {
    tone: JoinCategoryTone;
    count: number;
    label: string;
    /** Carbon icon of the category; `swatch` replaces it with a map swatch. */
    icon?: Component<{ size?: number }>;
    /** CSS background of the swatch drawn instead of an icon. */
    swatch?: string;
    /** An accordion header: shows the chevron and sets `aria-expanded`. */
    expanded?: boolean;
    /** A toggle: sets `aria-pressed`. */
    pressed?: boolean;
    compact?: boolean;
    title?: string;
    onclick: () => void;
  }

  let {
    tone,
    count,
    label,
    icon: Icon,
    swatch,
    expanded,
    pressed,
    compact = false,
    title,
    onclick
  }: Props = $props();

  const iconSize = $derived(compact ? 16 : 20);
</script>

<button
  type="button"
  class="join-category-header tone-{tone}"
  class:compact={compact}
  aria-expanded={expanded}
  aria-pressed={pressed}
  title={title}
  onclick={onclick}
>
  <span class="category-icon" aria-hidden="true">
    {#if swatch}
      <span class="category-swatch" style:background={swatch}></span>
    {:else if Icon}
      <Icon size={iconSize} />
    {/if}
  </span>
  <span class="category-count">{formatValue(count)}</span>
  <span class="category-label">{label}</span>
  {#if expanded !== undefined}
    <span class="category-chevron" aria-hidden="true">
      {#if expanded}
        <ChevronUp size={iconSize} />
      {:else}
        <ChevronDown size={iconSize} />
      {/if}
    </span>
  {/if}
</button>

<style>
  .join-category-header {
    --category-color: var(--cds-text-secondary, #525252);
    --category-background: var(--cds-layer-01, #f4f4f4);
    display: flex;
    align-items: center;
    gap: var(--kh-gap-inline);
    width: 100%;
    padding: var(--kh-gap-param) var(--kh-pad-panel);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font: inherit;
    transition: background-color 0.15s;
  }

  .join-category-header:hover,
  .join-category-header[aria-pressed='true'] {
    background-color: var(--khartis-additions-join-row-hover, #f4f4f4);
  }

  .join-category-header[aria-pressed='true'] {
    box-shadow: inset 2px 0 0 var(--khartis-additions-join-label, #00539a);
  }

  .join-category-header:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: -2px;
  }

  .tone-success {
    --category-color: var(--khartis-additions-join-success, #24a148);
    --category-background: var(--khartis-additions-join-success-bg, #defbe6);
  }

  .tone-warning {
    --category-color: var(--khartis-additions-join-warning, #f1c21b);
    --category-background: var(--khartis-additions-join-warning-bg, #fcf4d6);
  }

  .tone-error {
    --category-color: var(--khartis-additions-join-error, #da1e28);
    --category-background: var(--khartis-additions-join-error-bg, #fff1f1);
  }

  .tone-ignored,
  .tone-missing {
    --category-border: var(--cds-border-strong-01, #8d8d8d);
  }

  .category-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .category-icon :global(svg) {
    fill: var(--category-color);
  }

  .category-swatch {
    width: 1.125rem;
    height: 1.125rem;
    box-shadow: inset 0 0 0 1px rgba(22, 22, 22, 0.25);
  }

  .category-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 4ch;
    padding: 0 var(--kh-gap-inline) 2px var(--kh-gap-inline);
    font-weight: 600;
    font-size: 1rem;
    line-height: var(--kh-line-primitive);
    color: var(--cds-text-primary, #161616);
    background-color: var(--category-background);
    border-bottom: 1px solid var(--category-border, var(--category-color));
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .category-label {
    flex: 1;
    font-weight: 400;
    font-size: 0.875rem;
    line-height: var(--kh-line-primitive);
    color: var(--khartis-additions-join-label, #00539a);
  }

  .category-chevron {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--cds-text-primary, #161616);
  }

  .compact {
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
  }

  .compact .category-count {
    min-width: 3.5ch;
    font-size: 0.8125rem;
  }

  .compact .category-label {
    font-size: 0.75rem;
  }

  .compact .category-swatch {
    width: 0.875rem;
    height: 0.875rem;
  }
</style>
