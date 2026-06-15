<script lang="ts">
  import ProjectionPreview from '$lib/features/commons/components/projection-preview.svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import * as m from '$lib/paraglide/messages';
  import SimpleRadio from './simple-radio.svelte';
  import { CheckmarkFilled } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { KEY } from '../constants/dom.constants';
  import { overflowTitle } from '../utils/overflow-title';

  interface ProjectionCardProps {
    title: string;
    subtitle?: string;
    tag?: string;
    ratio?: string;
    previewLabel?: string;
    projectionId?: string;
    selected?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'blue' | 'gray';
    layout?: 'horizontal' | 'vertical';
    fullWidth?: boolean;
    onclick?: () => void;
    showInfo?: boolean;
    showTag?: boolean;
    equalArea?: boolean;
    description?: string;
  }

  let {
    title,
    subtitle = m.card_subtitle_surfaces(),
    tag = m.tag_rectangular(),
    ratio = '1:1',
    previewLabel = m.projection_preview_label(),
    projectionId,
    selected = false,
    disabled = false,
    variant = 'default',
    layout = 'horizontal',
    fullWidth = false,
    onclick,
    showInfo = true,
    showTag = true,
    equalArea = false,
    description
  }: ProjectionCardProps = $props();

  function isInfoInteractionTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element && Boolean(target.closest('[data-card-info]'))
    );
  }

  function handleCardClick(event?: MouseEvent | KeyboardEvent) {
    if (event && isInfoInteractionTarget(event.target)) {
      return;
    }

    if (!disabled && onclick) onclick();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (isInfoInteractionTarget(event.target)) {
      return;
    }

    if ((event.key === KEY.ENTER || event.key === KEY.SPACE) && !disabled) {
      event.preventDefault();
      handleCardClick(event);
    }
  }

  const isVertical = $derived(layout === 'vertical');
  const useSuggestionTheme = $derived(variant !== 'gray');
  const hasSubtitle = $derived(Boolean(subtitle?.trim()));

  const cardClasses = $derived(
    clsx('projection-card', {
      'projection-card--full-width': fullWidth,
      'projection-card--vertical': isVertical,
      'projection-card--suggestion': useSuggestionTheme,
      'projection-card--default': !useSuggestionTheme,
      selected,
      disabled
    })
  );
</script>

<div
  class={cardClasses}
  role="button"
  tabindex={disabled ? -1 : 0}
  onclick={(event: MouseEvent) => handleCardClick(event)}
  onkeydown={handleKeyDown}
  aria-pressed={selected}
  aria-disabled={disabled}
>
  <div class="preview-section" data-preview-ratio={ratio}>
    <ProjectionPreview
      projectionId={projectionId}
      label={previewLabel}
      theme={useSuggestionTheme ? 'suggestion' : 'default'}
    />
  </div>

  <div class="content-section">
    <div class="header">
      <div class="title-copy">
        <p class="title" use:overflowTitle={title}>{title}</p>
        {#if hasSubtitle}
          <p class="subtitle">{subtitle}</p>
        {/if}
      </div>

      <div class="title-radio kh-card-radio">
        <SimpleRadio
          checked={selected}
          disabled={disabled}
          labelText={title}
          hideLabel
        />
      </div>
    </div>

    <div class="footer">
      <div class="meta-group">
        {#if equalArea}
          <span class="surface-indicator">
            {m.card_subtitle_surfaces()}
            <CheckmarkFilled size={16} />
          </span>
        {/if}
        {#if showTag && tag}
          <span class="projection-tag-pill">{tag}</span>
        {/if}
      </div>

      {#if showInfo && description}
        <div class="info-slot" data-card-info>
          <InfoPopover
            text={description}
            align={isVertical ? 'top' : 'bottom'}
          />
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .projection-card {
    --projection-card-background: var(
      --khartis-additions-layer-01-suggestions,
      #e5f6ff
    );
    --projection-card-border-color: var(
      --khartis-additions-border-tile-01-suggestions,
      #82cfff
    );
    --projection-card-border-width: 1px;
    --projection-card-focus-color: var(
      --khartis-additions-focus-suggestions,
      #0072c3
    );
    --kh-card-radio-color: #003a6d;
    --kh-card-radio-disabled-color: rgba(0, 58, 109, 0.25);
    --kh-card-radio-focus-color: var(--projection-card-focus-color);
    position: relative;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    min-height: 120px;
    border-radius: 0;
    cursor: pointer;
    border: var(--projection-card-border-width) solid
      var(--projection-card-border-color);
    background: var(--projection-card-background);
  }

  .projection-card.projection-card--default {
    --projection-card-background: var(--cds-layer-01, #f4f4f4);
    --projection-card-border-color: var(--cds-border-subtle-01, #c6c6c6);
    --projection-card-focus-color: var(--cds-interactive-03, #726e6e);
    --kh-card-radio-color: #161616;
    --kh-card-radio-disabled-color: var(
      --cds-icon-disabled,
      rgba(22, 22, 22, 0.25)
    );
  }

  .projection-card.projection-card--vertical {
    flex-direction: column;
    min-height: 176px;
  }

  .projection-card.projection-card--full-width {
    width: 100%;
  }

  .projection-card.selected {
    --projection-card-border-color: var(--projection-card-focus-color);
  }

  .projection-card.selected::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2;
    border: 3px solid var(--projection-card-focus-color);
    pointer-events: none;
  }

  .projection-card.projection-card--default.selected {
    --projection-card-border-width: 1px;
    --projection-card-border-color: var(--cds-border-strong-01, #8d8d8d);
  }

  .projection-card.disabled {
    cursor: default;
    pointer-events: none;
    opacity: 0.5;
  }

  .projection-card.projection-card--suggestion:hover:not(.disabled) {
    --projection-card-background: var(
      --khartis-additions-layer-hover-01-suggestions,
      #cceeff
    );
  }

  .projection-card.projection-card--default:hover:not(.disabled) {
    --projection-card-background: var(--cds-layer-hover-01, #e8e8e8);
  }

  .projection-card:focus-visible {
    outline: 2px solid var(--projection-card-focus-color);
    outline-offset: 0;
  }

  .preview-section {
    position: relative;
    width: 120px;
    min-width: 120px;
    min-height: 120px;
    flex: 0 0 120px;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1px;
    box-sizing: border-box;
    background: #ffffff;
    --tile-preview-background: var(--cds-layer-02, #ffffff);
    --tile-preview-color: var(--cds-interactive-03, #726e6e);
  }

  .projection-card--vertical .preview-section {
    width: 100%;
    min-width: 0;
    height: auto;
    align-self: auto;
    aspect-ratio: 1 / 1;
    flex: 0 0 auto;
  }

  .projection-card--suggestion .preview-section {
    --tile-preview-background: var(
      --khartis-additions-layer-02-suggestions,
      #ffffff
    );
    --tile-preview-color: var(
      --khartis-additions-interactive-suggestions,
      #0072c3
    );
  }

  .content-section {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: space-between;
    gap: 0;
    min-width: 0;
    box-sizing: border-box;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    padding: 16px 8px 8px 16px;
  }

  .projection-card--vertical .header {
    padding-bottom: 8px;
  }

  .title-copy {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .title,
  .subtitle {
    margin: 0;
  }

  .title {
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  .projection-card--default .title {
    color: var(--cds-text-primary, #161616);
  }

  .subtitle {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    overflow-wrap: break-word;
    color: var(--khartis-additions-text-secondary-suggestions, #00539a);
  }

  .projection-card--default .subtitle {
    color: var(--cds-text-secondary, #525252);
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 16px 16px;
  }

  .meta-group {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
  }

  .surface-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--khartis-additions-text-secondary-suggestions, #00539a);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    white-space: nowrap;
  }

  .surface-indicator :global(svg) {
    fill: var(--khartis-additions-text-secondary-suggestions, #00539a);
  }

  .projection-tag-pill {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    height: 18px;
    padding: 1px 8px;
    border-radius: 9px;
    background: var(--tag-background, #bae6ff);
    color: var(--tag-color, #00539a);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title-radio {
    flex-shrink: 0;
    padding-right: 8px;
  }

  .info-slot {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .info-slot :global(.info-btn) {
    min-width: 16px;
    min-height: 16px;
  }

  .projection-card--suggestion .info-slot {
    --cds-icon-secondary: var(
      --khartis-additions-icon-secondary-suggestions,
      #00539a
    );
    --cds-icon-primary: var(
      --khartis-additions-icon-primary-suggestions,
      #003a6d
    );
  }
</style>
