<script lang="ts">
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { RadioButton } from 'carbon-components-svelte';
  import { Calendar, Earth } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { KEY } from '$lib/features/commons/constants/dom.constants';
  import { UI_CONSTANTS } from '../../constants';

  interface BasemapCardVerticalProps {
    basemap: BasemapMetadata;
    selected?: boolean;
    matchScore?: number;
    showMatchScore?: boolean;
    variant?: 'blue' | 'gray';
    disabled?: boolean;
    onclick?: () => void;
  }

  let {
    basemap,
    selected = false,
    matchScore,
    showMatchScore = true,
    variant = 'blue',
    disabled = false,
    onclick
  }: BasemapCardVerticalProps = $props();

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
  }

  const isBlue = $derived(variant === 'blue');

  const cardClasses = $derived(
    clsx('basemap-card', {
      'variant-blue': isBlue,
      'variant-gray': !isBlue,
      selected,
      disabled
    })
  );

  const matchPercentage = $derived(
    matchScore !== undefined ? Math.round(matchScore) : undefined
  );

  const filledSegments = $derived(
    matchPercentage !== undefined
      ? Math.round(
          (matchPercentage / 100) * UI_CONSTANTS.BASEMAP_JOIN_TOTAL_SEGMENTS
        )
      : 0
  );

  /**
   * Compute the closest standard aspect ratio from the basemap's bounding box.
   */
  const STANDARD_RATIOS: [number, string][] = [
    [1, '1:1'],
    [4 / 3, '4:3'],
    [3 / 2, '3:2'],
    [16 / 10, '16:10'],
    [16 / 9, '16:9'],
    [2, '2:1']
  ];

  const aspectRatio = $derived.by(() => {
    if (!basemap.bbox || basemap.bbox.length < 4) return null;
    const [minX, minY, maxX, maxY] = basemap.bbox;
    const width = Math.abs(maxX - minX);
    const height = Math.abs(maxY - minY);
    if (height === 0) return '2:1';
    const ratio = width / height;
    let closest = STANDARD_RATIOS[0];
    let minDiff = Math.abs(ratio - closest[0]);
    for (const entry of STANDARD_RATIOS) {
      const diff = Math.abs(ratio - entry[0]);
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry;
      }
    }
    return closest[1];
  });
</script>

<div
  class={cardClasses}
  role="button"
  tabindex={disabled ? -1 : 0}
  onclick={handleCardClick}
  onkeydown={handleKeyDown}
  aria-label={basemap.subtitle_fr
    ? `${basemap.title_fr} · ${basemap.subtitle_fr}`
    : basemap.title_fr}
  aria-pressed={selected}
  aria-disabled={disabled}
>
  <div class="preview-section">
    {#if aspectRatio}
      <span class="ratio-badge">{aspectRatio}</span>
    {/if}
    <Earth size={32} />
    <span class="preview-label">{m.basemap_preview()}</span>
  </div>

  <div class="content-section">
    <div class="title-row">
      <span class="card-title"
        >{basemap.title_fr}{#if basemap.subtitle_fr}<span class="card-subtitle"
            >&ensp;·&ensp;{basemap.subtitle_fr}</span
          >{/if}</span
      >
      <div class="radio-wrapper">
        <RadioButton
          checked={selected}
          disabled={disabled}
          onclick={handleRadioClick}
        />
      </div>
    </div>

    <div class="metadata-row">
      <span class="source">{basemap.source}</span>
      <span class="date">
        <Calendar size={16} />
        {basemap.date}
      </span>
    </div>
  </div>

  {#if showMatchScore && matchPercentage !== undefined}
    <div class="match-section">
      <span class="match-label">{m.basemap_match_score()}</span>
      <div
        class="segmented-bar"
        role="progressbar"
        aria-valuenow={matchPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {#each Array(UI_CONSTANTS.BASEMAP_JOIN_TOTAL_SEGMENTS) as _, i (i)}
          <div class="segment" class:filled={i < filledSegments}></div>
        {/each}
      </div>
      <span class="match-value">{matchPercentage} %</span>
    </div>
  {/if}
</div>

<style>
  .basemap-card {
    display: flex;
    flex-direction: column;
    width: var(--basemap-card-width, 184px);
    min-width: var(--basemap-card-width, 184px);
    flex-shrink: 0;
    overflow: hidden;
    cursor: pointer;
    box-sizing: border-box;
    padding-bottom: var(--basemap-card-padding-bottom, 16px);
    position: relative;
  }

  .basemap-card.disabled {
    cursor: default;
    pointer-events: none;
  }

  .basemap-card.variant-blue {
    background-color: #e5f6ff;
  }

  .basemap-card.variant-gray {
    background-color: #f4f4f4;
  }

  .basemap-card.variant-blue:not(.selected) {
    border: 1px solid #82cfff;
  }

  .basemap-card.variant-blue.selected {
    border: 3px solid #1192e8;
  }

  .basemap-card.variant-gray:not(.selected) {
    border: 1px solid #c6c6c6;
  }

  .basemap-card.variant-gray.selected {
    border: 2px solid #8d8d8d;
  }

  .basemap-card.variant-blue:hover:not(.disabled) {
    background-color: #cceeff;
  }

  .basemap-card.variant-gray:hover:not(.disabled) {
    background-color: #e8e8e8;
  }

  .basemap-card.variant-blue:hover:not(.disabled) .preview-section {
    background-color: #cceeff;
  }

  .basemap-card.variant-gray:hover:not(.disabled) .preview-section {
    background-color: #e8e8e8;
  }

  .basemap-card:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: 2px;
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1px;
    min-height: var(--basemap-card-preview-min-height, 100px);
    gap: 8px;
    background-color: var(--cds-ui-01, #ffffff);
    position: relative;
  }

  .preview-section :global(svg) {
    color: #726e6e;
  }

  .variant-blue .preview-section :global(svg) {
    color: #0072c3;
  }

  .ratio-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 14px;
    letter-spacing: 0.32px;
    padding: 1px 6px;
    background-color: #e0e0e0;
    color: #525252;
    border-radius: 2px;
  }

  .variant-blue .ratio-badge {
    background-color: #d0e2ff;
    color: #0043ce;
  }

  .preview-label {
    font-size: 0.75rem;
    color: #726e6e;
    letter-spacing: 0.32px;
    line-height: 16px;
  }

  .variant-blue .preview-label {
    color: #0072c3;
  }

  .content-section {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 8px 8px 16px;
  }

  .card-title {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 18px;
    letter-spacing: 0.16px;
    flex: 1;
    min-width: 0;
    max-height: 36px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .variant-blue .card-title {
    color: #003a6d;
  }

  .variant-blue.disabled .card-title {
    color: rgba(0, 58, 109, 0.25);
  }

  .variant-gray .card-title {
    color: #161616;
  }

  .variant-gray.disabled .card-title {
    color: #c6c6c6;
  }

  .radio-wrapper {
    flex-shrink: 0;
    padding-right: 8px;
  }

  .card-subtitle {
    font-weight: 400;
    opacity: 0.7;
  }

  .metadata-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 16px 0;
  }

  .source {
    font-size: 0.75rem;
    line-height: 16px;
    letter-spacing: 0.32px;
    text-decoration: underline;
    text-decoration-style: dashed;
    text-underline-offset: 2px;
    color: #525252;
  }

  .date {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    line-height: 16px;
    letter-spacing: 0.32px;
  }

  .variant-blue .date {
    color: #00539a;
  }

  .variant-blue.disabled .date {
    color: rgba(0, 58, 109, 0.25);
  }

  .variant-gray .date {
    color: #525252;
  }

  .variant-gray.disabled .date {
    color: #c6c6c6;
  }

  .match-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 16px 0;
    margin-top: 16px;
  }

  .variant-blue .match-section {
    border-top: 1px solid #82cfff;
  }

  .variant-gray .match-section {
    border-top: 1px solid #c6c6c6;
  }

  .match-label {
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 18px;
    letter-spacing: 0.16px;
    color: #161616;
  }

  .variant-blue .match-label {
    color: #003a6d;
  }

  .segmented-bar {
    display: flex;
    width: 100%;
    height: 4px;
    background-color: #c6c6c6;
  }

  .variant-blue .segmented-bar {
    background-color: #82cfff;
  }

  .segment {
    flex: 1;
    height: 4px;
  }

  .segment.filled {
    background-color: #726e6e;
  }

  .variant-blue .segment.filled {
    background-color: #0072c3;
  }

  .match-value {
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 16px;
    letter-spacing: 0.32px;
    color: #525252;
  }

  .variant-blue .match-value {
    color: #00539a;
  }
</style>
