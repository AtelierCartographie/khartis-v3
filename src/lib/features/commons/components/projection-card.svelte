<script lang="ts">
  import TilePreview from '$lib/features/commons/components/tile-preview.svelte';
  import { InfoPopover } from '$lib/features/commons/components/viz-controls';
  import * as m from '$lib/paraglide/messages';
  import { RadioButton, Tag } from 'carbon-components-svelte';
  import clsx from 'clsx';
  import { KEY } from '../constants/dom.constants';

  interface ProjectionCardProps {
    title: string;
    subtitle?: string;
    tag?: string;
    ratio?: string;
    previewLabel?: string;
    selected?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'blue' | 'gray';
    layout?: 'horizontal' | 'vertical';
    fullWidth?: boolean;
    onclick?: () => void;
    showInfo?: boolean;
    equalArea?: boolean;
    description?: string;
  }

  let {
    title,
    subtitle = m.card_subtitle_surfaces(),
    tag = m.tag_rectangular(),
    ratio = '1:1',
    previewLabel = m.projection_preview_label(),
    selected = false,
    disabled = false,
    variant = 'default',
    layout = 'horizontal',
    fullWidth = false,
    onclick,
    showInfo = true,
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

  function handleRadioClick(event: Event) {
    event.preventDefault();
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
  <div class="preview-section">
    <div class="preview-radio kh-card-radio">
      <RadioButton
        checked={selected}
        disabled={disabled}
        labelText={title}
        hideLabel
        onclick={handleRadioClick}
      />
    </div>

    <TilePreview
      ratio={ratio}
      label={previewLabel}
      theme={useSuggestionTheme ? 'suggestion' : 'default'}
    />
  </div>

  <div class="content-section">
    <div class="header">
      <div class="title-copy">
        <p class="title">{title}</p>
        {#if hasSubtitle}
          <p class="subtitle">{subtitle}</p>
        {/if}
      </div>
    </div>

    <div class="footer">
      <div class="tag-group">
        {#if tag}
          <Tag size="sm" type={useSuggestionTheme ? 'blue' : 'gray'}>{tag}</Tag>
        {/if}
        {#if equalArea}
          <Tag size="sm" type="green">{m.projection_equal_area()}</Tag>
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
    min-height: 216px;
  }

  .projection-card.projection-card--full-width {
    width: 100%;
  }

  .projection-card.selected {
    --projection-card-border-width: 4px;
    --projection-card-border-color: var(--projection-card-focus-color);
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
    padding: 1px;
    box-sizing: border-box;
    --tile-preview-background: var(--cds-layer-02, #ffffff);
    --tile-preview-color: var(--cds-interactive-03, #726e6e);
  }

  .projection-card--vertical .preview-section {
    width: 100%;
    min-width: 0;
    height: 104px;
  }

  .preview-radio {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 1;
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

  .projection-card--suggestion:hover:not(.disabled) .preview-section {
    --tile-preview-background: var(
      --khartis-additions-layer-hover-02-suggestions,
      #cceeff
    );
  }

  .projection-card--default:hover:not(.disabled) .preview-section {
    --tile-preview-background: var(--cds-layer-hover-02, #e8e8e8);
  }

  .content-section {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    box-sizing: border-box;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
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
    overflow-wrap: break-word;
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
  }

  .tag-group {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }

  .footer :global(.bx--tag) {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .info-slot {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
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
