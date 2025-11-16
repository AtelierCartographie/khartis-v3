<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { RadioButton, Tag } from 'carbon-components-svelte';
  import { Checkmark, Map, Information } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

  interface BasemapCardProps {
    basemap: BasemapMetadata;
    selected?: boolean;
    matchScore?: number;
    onclick?: () => void;
    showInfo?: boolean;
  }

  let {
    basemap,
    selected = false,
    matchScore,
    onclick,
    showInfo = true
  }: BasemapCardProps = $props();

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
    event.preventDefault();
  }

  const cardClasses = $derived(
    clsx('basemap-card', {
      'border-2 border-blue': selected,
      'border border-pale-blue': !selected,
      'cursor-pointer': true
    })
  );

  const matchPercentage = $derived(
    matchScore !== undefined ? Math.round(matchScore) : null
  );
</script>

<div
  id="kh-basemap-card"
  class={cardClasses}
  role="button"
  tabindex={0}
  onclick={handleCardClick}
  onkeydown={handleKeyDown}
>
  <div class="card-left centered-flex-col">
    <Map size={32} />
    <span class="text-sm mt-1">{basemap.projection}</span>
  </div>

  <div class="card-right">
    <div class="card-header">
      <h6 class="title">{basemap.title}</h6>

      <RadioButton checked={selected} onclick={handleRadioClick} />
    </div>

    <div class="card-body">
      <p class="description">{basemap.description}</p>

      <div class="metadata">
        <span class="metadata-item">
          <strong>{m.basemap_source()}:</strong>
          {basemap.source}
        </span>
        <span class="metadata-item">
          <strong>{m.basemap_date()}:</strong>
          {basemap.date}
        </span>
      </div>

      {#if selected}
        <span class="check-badge" aria-hidden="true">
          <Checkmark size={16} />
        </span>
      {/if}
    </div>

    <div class="card-footer">
      <div class="tags">
        <Tag type="blue">{basemap.projection}</Tag>
        {#if matchPercentage !== null}
          <Tag
            type={matchPercentage >= 70
              ? 'green'
              : matchPercentage >= 40
                ? 'teal'
                : 'gray'}
          >
            {matchPercentage}% {m.basemap_match()}
          </Tag>
        {/if}
      </div>

      {#if showInfo}
        <button class="info-btn" aria-label={m.info()}>
          <Information size={20} />
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  #kh-basemap-card {
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    border-radius: 0;
  }

  .basemap-card {
    border-radius: 0;
  }

  .card-left {
    min-width: 112px;
    padding: 1rem 0.75rem;
    border-right: 1px solid var(--cds-layer-accent);
    gap: 0.25rem;
    background-color: var(--cds-ui-02);
    color: var(--cds-blue);
  }

  .card-right {
    flex: 1 1 auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.75rem;
    background-color: var(--cds-pale-blue);
    color: var(--cds-blue);
  }

  #kh-basemap-card:hover .card-right {
    background-color: var(--cds-medium-blue);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--cds-text-01);
  }

  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    position: relative;
  }

  .description {
    margin: 0;
    font-size: 0.75rem;
    color: var(--cds-text-02);
    line-height: 1.4;
  }

  .metadata {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--cds-text-02);
  }

  .metadata-item {
    display: flex;
    gap: 0.25rem;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  .tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .info-btn {
    width: 28px;
    height: 28px;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--cds-blue);
    outline: none;
    border: none;
  }

  .check-badge {
    position: absolute;
    top: 0;
    right: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 9999px;
    background: var(--cds-blue);
    color: var(--cds-inverse-01);
  }

  #kh-basemap-card:focus {
    outline: 2px solid var(--cds-focus);
    outline-offset: 2px;
  }

  .text-sm {
    font-size: 0.7rem;
  }

  .mt-1 {
    margin-top: 0.25rem;
  }

  .centered-flex-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .cursor-pointer {
    cursor: pointer;
  }
</style>
