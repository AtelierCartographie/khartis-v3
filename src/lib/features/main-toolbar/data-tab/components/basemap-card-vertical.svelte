<script lang="ts">
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import { m } from '$lib/paraglide/messages';
  import { ProgressBar } from 'carbon-components-svelte';
  import { Calendar, Checkmark, Earth } from 'carbon-icons-svelte';
  import clsx from 'clsx';

  interface BasemapCardVerticalProps {
    basemap: BasemapMetadata;
    selected?: boolean;
    matchScore?: number;
    showMatchScore?: boolean;
    variant?: 'blue' | 'gray';
    onclick?: () => void;
  }

  let {
    basemap,
    selected = false,
    matchScore,
    showMatchScore = true,
    variant = 'blue',
    onclick
  }: BasemapCardVerticalProps = $props();

  function handleCardClick() {
    if (onclick) onclick();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCardClick();
    }
  }

  const isGray = $derived(variant === 'gray');

  const cardClasses = $derived(
    clsx('basemap-card', {
      'variant-gray': isGray,
      'border-2 border-selected': selected,
      'border-default': !selected
    })
  );

  const matchPercentage = $derived(
    matchScore !== undefined ? Math.round(matchScore) : undefined
  );
</script>

<div
  class={cardClasses}
  role="button"
  tabindex={0}
  onclick={handleCardClick}
  onkeydown={handleKeyDown}
  aria-label={basemap.title}
  aria-pressed={selected}
>
  <!-- Top Section - Preview -->
  <div class="top-section">
    <Earth size={32} />
    <h4 class="ratio-label">16:9</h4>
    <span class="preview-label">{m.basemap_preview()}</span>
  </div>

  <!-- Content Section -->
  <div class="content-section">
    <div class="title-row">
      <span class="card-title">{basemap.title}</span>
      <div class="radio-indicator" class:selected={selected}>
        {#if selected}
          <Checkmark size={16} />
        {/if}
      </div>
    </div>

    {#if basemap.description}
      <p class="card-description">{basemap.description}</p>
    {/if}

    <div class="metadata-row">
      <span class="source">{basemap.source}</span>
      <span class="date">
        <Calendar size={16} />
        {basemap.date}
      </span>
    </div>
  </div>

  <!-- Match Section -->
  {#if showMatchScore && matchPercentage !== undefined}
    <div class="match-section">
      <span class="match-label">{m.basemap_match_score()}</span>
      <ProgressBar value={matchPercentage} max={100} size="sm" />
      <span class="match-value">{matchPercentage} %</span>
    </div>
  {/if}
</div>

<style>
  .basemap-card {
    display: flex;
    flex-direction: column;
    min-width: 220px;
    width: 220px;
    flex-shrink: 0;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s ease-out;
    box-sizing: border-box;
  }

  .basemap-card.border-default {
    border: 1px solid var(--cds-layer-01);
  }

  .basemap-card.variant-gray.border-default {
    border: 1px solid var(--cds-border-subtle);
  }

  .basemap-card.border-2.border-selected {
    border: 2px solid var(--cds-interactive-01);
  }

  .basemap-card.variant-gray.border-2.border-selected {
    border: 2px solid var(--cds-text-02);
  }

  .basemap-card:not(.variant-gray):hover .top-section {
    background-color: var(--cds-layer-01);
  }

  .basemap-card:not(.variant-gray):hover .content-section {
    background-color: var(--cds-layer-01);
  }

  .basemap-card.variant-gray:hover .top-section {
    background-color: var(--cds-layer-02);
  }

  .basemap-card.variant-gray:hover .content-section {
    background-color: var(--cds-layer-02);
  }

  .basemap-card:focus {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
  }

  .top-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.25rem 1rem;
    background-color: var(--cds-ui-02);
    gap: 0.25rem;
  }

  .top-section :global(svg) {
    color: var(--cds-interactive-01);
  }

  .variant-gray .top-section :global(svg) {
    color: var(--cds-text-01);
  }

  .ratio-label {
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0.25rem 0 0;
    color: var(--cds-interactive-01);
  }

  .variant-gray .ratio-label {
    color: var(--cds-text-01);
  }

  .preview-label {
    font-size: 0.75rem;
    color: var(--cds-interactive-01);
  }

  .variant-gray .preview-label {
    color: var(--cds-text-02);
  }

  .content-section {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    background-color: var(--cds-layer-01);
    gap: 0.375rem;
    flex: 1;
  }

  .variant-gray .content-section {
    background-color: var(--cds-layer-02);
  }

  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .card-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--cds-link-primary);
    line-height: 1.3;
    flex: 1;
  }

  .variant-gray .card-title {
    color: var(--cds-text-01);
  }

  .radio-indicator {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--cds-icon-02);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease-out;
  }

  .radio-indicator.selected {
    border-color: var(--cds-interactive-01);
    background-color: var(--cds-interactive-01);
    color: white;
  }

  .variant-gray .radio-indicator.selected {
    border-color: var(--cds-text-01);
    background-color: var(--cds-text-01);
  }

  .card-description {
    margin: 0;
    font-size: 0.75rem;
    color: var(--cds-link-primary);
    line-height: 1.4;
  }

  .variant-gray .card-description {
    color: var(--cds-text-02);
  }

  .metadata-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: var(--cds-link-primary);
    margin-top: 0.5rem;
  }

  .variant-gray .metadata-row {
    color: var(--cds-text-02);
  }

  .source {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .date {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .match-section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem 1rem;
    background-color: var(--cds-layer-01);
    border-top: 1px solid var(--cds-link-primary);
  }

  .variant-gray .match-section {
    background-color: var(--cds-layer-02);
    border-top: 1px solid var(--cds-text-02);
  }

  .match-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-link-primary);
  }

  .variant-gray .match-label {
    color: var(--cds-text-01);
  }

  .match-value {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--cds-link-primary);
  }

  .variant-gray .match-value {
    color: var(--cds-text-01);
  }

  .match-section :global(.bx--progress-bar) {
    margin: 0;
  }

  .match-section :global(.bx--progress-bar__label),
  .match-section :global(.bx--progress-bar__helper-text) {
    display: none;
  }

  .match-section :global(.bx--progress-bar__bar) {
    background-color: var(--cds-interactive-01);
  }

  .variant-gray .match-section :global(.bx--progress-bar__bar) {
    background-color: var(--cds-text-02);
  }
</style>
