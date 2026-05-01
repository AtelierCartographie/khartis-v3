<script lang="ts">
  import TilePreview from '$lib/features/commons/components/tile-preview.svelte';
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { getLocale } from '$lib/paraglide/runtime';
  import { RadioButton } from 'carbon-components-svelte';
  import { Calendar } from 'carbon-icons-svelte';
  import clsx from 'clsx';

  interface BasemapCardVerticalProps {
    basemap: BasemapMetadata;
    selected?: boolean;
    matchScore?: number;
    showMatchScore?: boolean;
    showMetadata?: boolean;
    variant?: 'blue' | 'gray';
    disabled?: boolean;
    onclick?: () => void;
  }

  let {
    basemap,
    selected = false,
    matchScore,
    showMatchScore = true,
    showMetadata = true,
    variant = 'blue',
    disabled = false,
    onclick
  }: BasemapCardVerticalProps = $props();

  const lang = getLocale();
  const title = $derived(lang === 'fr' ? basemap.title_fr : basemap.title_en);
  const subtitle = $derived(
    lang === 'fr'
      ? (basemap.subtitle_fr ?? '').trim()
      : (basemap.subtitle_en ?? '').trim()
  );

  function handleCardClick() {
    if (!disabled && onclick) onclick();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!disabled && (event.key === KEY.ENTER || event.key === KEY.SPACE)) {
      event.preventDefault();
      handleCardClick();
    }
  }

  function handleRadioClick(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    handleCardClick();
  }

  const isSuggestion = $derived(variant === 'blue');

  const cardClasses = $derived(
    clsx('basemap-card', {
      'basemap-card--suggestion': isSuggestion,
      'basemap-card--default': !isSuggestion,
      selected,
      disabled
    })
  );

  const matchPercentage = $derived(
    matchScore !== undefined ? Math.round(matchScore) : undefined
  );

  const aspectRatio = '16:9';
</script>

<div
  class={cardClasses}
  role="button"
  tabindex={disabled ? -1 : 0}
  onclick={handleCardClick}
  onkeydown={handleKeyDown}
  aria-label={subtitle
    ? `${title}${m.aria_label_separator()}${subtitle}`
    : title}
  aria-pressed={selected}
  aria-disabled={disabled}
>
  <div class="preview-section">
    <div class="preview-radio kh-card-radio" onclickcapture={handleRadioClick}>
      <RadioButton
        checked={selected}
        disabled={disabled}
        labelText={title}
        hideLabel
      />
    </div>

    <TilePreview
      ratio={aspectRatio ?? '2:1'}
      label={m.basemap_preview_label()}
      theme={isSuggestion ? 'suggestion' : 'default'}
    />
  </div>

  <div class="content-section">
    <div class="title-row">
      <div class="title-copy">
        <p class="card-title">{title}</p>
        {#if subtitle}
          <p class="card-subtitle">{subtitle}</p>
        {/if}
      </div>
    </div>

    {#if showMetadata}
      <div class="metadata-row">
        <span class="source">{basemap.source}</span>
        <span class="date">
          <Calendar size={16} />
          {basemap.date}
        </span>
      </div>
    {/if}
  </div>

  {#if showMatchScore && matchPercentage !== undefined}
    <div class="match-section">
      <div class="match-header">
        <span class="match-label">{m.basemap_match_score()}</span>
        <span class="match-value">{matchPercentage} %</span>
      </div>
      <div
        class="progress-bar"
        role="progressbar"
        aria-valuenow={matchPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div class="progress-fill" style="width: {matchPercentage}%"></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .basemap-card {
    --basemap-card-background: var(--cds-layer-01, #f4f4f4);
    --basemap-card-border-color: var(--cds-border-subtle-01, #c6c6c6);
    --basemap-card-border-width: 1px;
    --basemap-card-focus-color: var(--cds-interactive-03, #726e6e);
    --kh-card-radio-color: #161616;
    --kh-card-radio-disabled-color: var(
      --cds-icon-disabled,
      rgba(22, 22, 22, 0.25)
    );
    --kh-card-radio-focus-color: var(--basemap-card-focus-color);
    display: flex;
    flex-direction: column;
    width: var(--basemap-card-width, 184px);
    min-width: var(--basemap-card-width, 184px);
    flex-shrink: 0;
    overflow: hidden;
    cursor: pointer;
    box-sizing: border-box;
    position: relative;
    background: var(--basemap-card-background);
    border: var(--basemap-card-border-width) solid
      var(--basemap-card-border-color);
  }

  .basemap-card.disabled {
    cursor: default;
    pointer-events: none;
  }

  .basemap-card.basemap-card--suggestion {
    --basemap-card-background: var(
      --khartis-additions-layer-01-suggestions,
      #e5f6ff
    );
    --basemap-card-border-color: var(
      --khartis-additions-border-tile-01-suggestions,
      #82cfff
    );
    --basemap-card-focus-color: var(
      --khartis-additions-focus-suggestions,
      #0072c3
    );
    --kh-card-radio-color: #003a6d;
    --kh-card-radio-disabled-color: rgba(0, 58, 109, 0.25);
  }

  .basemap-card.basemap-card--default.selected {
    --basemap-card-border-width: 2px;
    --basemap-card-border-color: var(--cds-border-strong-01, #8d8d8d);
  }

  .basemap-card.basemap-card--suggestion.selected {
    --basemap-card-border-width: 3px;
    --basemap-card-border-color: var(
      --khartis-additions-border-strong-01-suggestions,
      #1192e8
    );
  }

  .basemap-card.basemap-card--suggestion:hover:not(.disabled) {
    --basemap-card-background: var(
      --khartis-additions-layer-hover-01-suggestions,
      #cceeff
    );
  }

  .basemap-card.basemap-card--default:hover:not(.disabled) {
    --basemap-card-background: var(--cds-layer-hover-01, #e8e8e8);
  }

  .basemap-card.basemap-card--default.disabled {
    --basemap-card-border-color: var(--cds-border-disabled, #c6c6c6);
    --basemap-card-text-disabled: var(
      --cds-text-disabled,
      rgba(22, 22, 22, 0.25)
    );
    --basemap-card-icon-disabled: var(
      --cds-icon-disabled,
      rgba(22, 22, 22, 0.25)
    );
  }

  .basemap-card.basemap-card--suggestion.disabled {
    --basemap-card-border-color: var(
      --khartis-additions-border-disabled-suggestions,
      #82cfff
    );
    --basemap-card-text-disabled: var(
      --khartis-additions-text-disabled-suggestions,
      #003a6d40
    );
    --basemap-card-icon-disabled: var(
      --khartis-additions-icon-disabled-suggestions,
      #003a6d40
    );
  }

  .basemap-card:focus-visible {
    outline: 2px solid var(--basemap-card-focus-color);
    outline-offset: 0;
  }

  .preview-section {
    position: relative;
    aspect-ratio: 16/9;
    overflow: hidden;
    padding: 1px;
    box-sizing: border-box;
    --tile-preview-background: var(--cds-layer-02, #ffffff);
    --tile-preview-color: var(--cds-interactive-03, #726e6e);
  }

  .basemap-card--suggestion .preview-section {
    --tile-preview-background: var(
      --khartis-additions-layer-02-suggestions,
      #ffffff
    );
    --tile-preview-color: var(
      --khartis-additions-interactive-suggestions,
      #0072c3
    );
  }

  .basemap-card--suggestion:hover:not(.disabled) .preview-section {
    --tile-preview-background: var(
      --khartis-additions-layer-hover-02-suggestions,
      #cceeff
    );
  }

  .basemap-card--default:hover:not(.disabled) .preview-section {
    --tile-preview-background: var(--cds-layer-hover-02, #e8e8e8);
  }

  .basemap-card.disabled .preview-section {
    --tile-preview-color: var(
      --basemap-card-icon-disabled,
      var(--basemap-card-text-disabled)
    );
  }

  .preview-radio {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 1;
  }

  .content-section {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding: 16px;
    gap: 12px;
  }

  .title-row {
    display: flex;
    min-width: 0;
  }

  .title-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-title,
  .card-subtitle {
    margin: 0;
  }

  .card-title {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    overflow-wrap: break-word;
    color: var(--cds-text-primary, #161616);
  }

  .basemap-card--suggestion .card-title {
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  .card-subtitle {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    overflow-wrap: break-word;
    color: var(--cds-text-primary, #161616);
  }

  .basemap-card--suggestion .card-subtitle {
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  .metadata-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-top: auto;
  }

  .source {
    font-size: 0.75rem;
    line-height: 16px;
    letter-spacing: 0.32px;
    text-decoration: underline;
    text-decoration-style: solid;
    text-underline-offset: 2px;
    color: var(--cds-text-secondary, #525252);
  }

  .date {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
  }

  .basemap-card--suggestion .source,
  .basemap-card--suggestion .date {
    color: var(--khartis-additions-text-secondary-suggestions, #00539a);
  }

  .match-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px 16px;
    border-top: 1px solid var(--cds-border-subtle-01, #c6c6c6);
  }

  .match-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }

  .basemap-card--suggestion .match-section {
    border-top-color: var(
      --khartis-additions-border-tile-01-suggestions,
      #82cfff
    );
  }

  .match-label {
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: var(--cds-text-primary, #161616);
    flex: 1;
    overflow-wrap: break-word;
  }

  .basemap-card--suggestion .match-label {
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: var(--cds-border-subtle-01, #c6c6c6);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--cds-interactive-03, #726e6e);
  }

  .basemap-card--suggestion .progress-bar {
    background: var(--khartis-additions-border-subtle-01-suggestions, #82cfff);
  }

  .basemap-card--suggestion .progress-fill {
    background: var(
      --khartis-additions-border-interactive-suggestions,
      #0072c3
    );
  }

  .match-value {
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .basemap-card--suggestion .match-value {
    color: var(--khartis-additions-text-secondary-suggestions, #00539a);
  }

  .basemap-card.disabled .card-title,
  .basemap-card.disabled .card-subtitle,
  .basemap-card.disabled .source,
  .basemap-card.disabled .date,
  .basemap-card.disabled .match-label,
  .basemap-card.disabled .match-value {
    color: var(--basemap-card-text-disabled);
  }
</style>
