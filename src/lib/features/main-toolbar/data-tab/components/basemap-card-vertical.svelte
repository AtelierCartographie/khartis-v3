<script lang="ts">
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import { m } from '$lib/paraglide/messages';
  import { ProgressBar, RadioButton } from 'carbon-components-svelte';
  import { Calendar, Map } from 'carbon-icons-svelte';
  import clsx from 'clsx';

  interface BasemapCardVerticalProps {
    basemap: BasemapMetadata;
    selected?: boolean;
    matchScore?: number;
    showMatchScore?: boolean;
    onclick?: () => void;
  }

  let {
    basemap,
    selected = false,
    matchScore,
    showMatchScore = true,
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

  function handleRadioClick(event: Event) {
    event.stopPropagation();
  }

  const cardClasses = $derived(
    clsx('basemap-card-vertical', {
      selected: selected
    })
  );

  const matchPercentage = $derived(
    matchScore !== undefined ? Math.round(matchScore) : 75 // Default for demo
  );

  const matchHelperText = $derived(`${matchPercentage}%`);
</script>

<div
  class={cardClasses}
  role="button"
  tabindex={0}
  onclick={handleCardClick}
  onkeydown={handleKeyDown}
  aria-label={`${basemap.title} - ${matchPercentage}% ${m.basemap_match()}`}
>
  <!-- Preview Image 16:9 -->
  <div class="preview-container">
    <div class="preview-placeholder">
      <Map size={32} />
      <span class="aspect-ratio-label">16:9</span>
      <span class="preview-label">Basemap preview</span>
    </div>
  </div>

  <!-- Radio Button (Top Right) -->
  <div class="radio-container">
    <RadioButton checked={selected} onclick={handleRadioClick} labelText="" />
  </div>

  <!-- Card Content -->
  <div class="card-content">
    <!-- Title -->
    <h4 class="card-title">{basemap.title}</h4>

    <!-- Description -->
    {#if basemap.description}
      <p class="card-description">{basemap.description}</p>
    {/if}

    <!-- Metadata Row -->
    <div class="metadata-row">
      <span class="metadata-item">{basemap.source}</span>
      <span class="metadata-separator">•</span>
      <span class="metadata-item metadata-date">
        <Calendar size={16} />
        {basemap.date}
      </span>
    </div>

    <!-- Match Score Progress Bar -->
    {#if showMatchScore}
      <div class="match-score-section">
        <span class="match-score-label">{m.basemap_match_score()}</span>
        <ProgressBar
          value={matchPercentage}
          max={100}
          helperText={matchHelperText}
          size="sm"
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .basemap-card-vertical {
    position: relative;
    display: flex;
    flex-direction: column;
    background-color: var(--cds-layer-01);
    border: 2px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    overflow: hidden;
  }

  .basemap-card-vertical:hover {
    border-color: var(--cds-border-interactive);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  }

  .basemap-card-vertical.selected {
    border-color: var(--cds-interactive-01);
    border-width: 2px;
    box-shadow: 0 0 0 2px var(--cds-focus);
    background-color: var(--cds-highlight);
  }

  .basemap-card-vertical:focus {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
  }

  /* Preview Container 16:9 */
  .preview-container {
    position: relative;
    width: 100%;
    padding-top: 56.25%; /* 16:9 aspect ratio */
    background-color: var(--cds-layer-accent-01);
    overflow: hidden;
  }

  .preview-placeholder {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--cds-spacing-03);
    color: var(--cds-icon-secondary);
  }

  .aspect-ratio-label {
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
    font-weight: 500;
  }

  .preview-label {
    font-size: 0.75rem;
    color: var(--cds-link-01);
    margin-top: var(--cds-spacing-02);
  }

  /* Radio Button */
  .radio-container {
    position: absolute;
    top: var(--cds-spacing-04);
    right: var(--cds-spacing-04);
    z-index: 10;
    background-color: var(--cds-layer-01);
    border-radius: 50%;
    padding: var(--cds-spacing-02);
  }

  /* Card Content */
  .card-content {
    padding: var(--cds-spacing-05);
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .card-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    line-height: 1.3;
  }

  .card-description {
    margin: 0;
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    line-height: 1.4;
  }

  /* Metadata Row */
  .metadata-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    font-size: 0.75rem;
    color: var(--cds-text-secondary);
  }

  .metadata-item {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .metadata-separator {
    color: var(--cds-text-disabled);
  }

  .metadata-date {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  /* Match Score Section */
  .match-score-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .match-score-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--cds-text-secondary);
  }

  .match-score-section :global(.bx--progress-bar) {
    margin-top: 0;
  }

  .match-score-section :global(.bx--progress-bar__label) {
    display: none; /* Hide default label, we have custom one */
  }

  .match-score-section :global(.bx--progress-bar__helper-text) {
    font-weight: 600;
    text-align: right;
    margin-top: var(--cds-spacing-02);
  }

  /* Progress bar color based on score */
  .basemap-card-vertical :global(.bx--progress-bar__bar) {
    background-color: var(--cds-support-success);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .card-content {
      padding: var(--cds-spacing-04);
    }

    .card-title {
      font-size: 0.875rem;
    }

    .card-description {
      font-size: 0.8125rem;
    }
  }
</style>
