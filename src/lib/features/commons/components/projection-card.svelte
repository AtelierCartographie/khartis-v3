<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { RadioButton, Tag } from 'carbon-components-svelte';
  import { Checkmark, Earth, Information } from 'carbon-icons-svelte';
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
    showInfo = true
  }: ProjectionCardProps = $props();

  function handleCardClick() {
    if (!disabled && onclick) onclick();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if ((event.key === KEY.ENTER || event.key === KEY.SPACE) && !disabled) {
      event.preventDefault();
      handleCardClick();
    }
  }

  function handleRadioClick(event: Event) {
    event.preventDefault();
  }

  const isBlueVariant = $derived(variant === 'blue');
  const isGrayVariant = $derived(variant === 'gray');
  const isDefaultVariant = $derived(variant === 'default');

  const cardClasses = $derived(
    clsx('projection-card', {
      'full-width': fullWidth,
      'border-2 border-dark-gray': selected && (disabled || isGrayVariant),
      'border-selected-blue':
        selected && !disabled && (isBlueVariant || isDefaultVariant),
      'border border-medium-gray': !selected && (disabled || isGrayVariant),
      'border border-medium-blue': !selected && !disabled && isBlueVariant,
      'border-unselected-blue': !selected && !disabled && isDefaultVariant,
      'opacity-50': disabled,
      'cursor-pointer': !disabled,
      vertical: layout === 'vertical'
    })
  );

  const leftClasses = $derived(
    clsx('card-left centered-flex-col', {
      'variant-gray': isGrayVariant,
      'color-text-01': disabled || isGrayVariant,
      'color-blue': !disabled && (isBlueVariant || isDefaultVariant)
    })
  );

  const rightClasses = $derived(
    clsx('card-right', {
      'variant-gray': isGrayVariant,
      'bg-light-gray color-text-01': disabled || isGrayVariant,
      'bg-layer-01-suggestions':
        !disabled && (isBlueVariant || isDefaultVariant)
    })
  );
</script>

<div
  id="kh-projection-card"
  class={cardClasses}
  role="button"
  tabindex={disabled ? -1 : 0}
  onclick={handleCardClick}
  onkeydown={handleKeyDown}
>
  <div class={leftClasses}>
    <Earth size={32} />

    <h4 class="mt-2">{ratio}</h4>

    <span class="text-sm">{previewLabel}</span>
  </div>

  <div class={rightClasses}>
    <div class="card-header">
      <h6 class="title">{title}</h6>

      <RadioButton
        checked={selected}
        disabled={disabled}
        onclick={handleRadioClick}
      />
    </div>

    <div class="card-body">
      <div class="subtitle">
        <span>{subtitle}</span>
        {#if selected}
          <span class="check-badge ml-1" aria-hidden="true">
            <Checkmark size={16} />
          </span>
        {/if}
      </div>
    </div>

    <div class="card-footer">
      <Tag type="blue">{tag}</Tag>

      {#if showInfo}
        <button class="info-btn" aria-label={m.info()}>
          <Information size={20} />
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  #kh-projection-card {
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
  }

  #kh-projection-card.full-width {
    width: 100%;
  }

  #kh-projection-card.vertical {
    flex-direction: column;
  }

  .projection-card {
    border-radius: 0;
  }

  /* Selected: 4px solid #0072c3 (focus-suggestions) */
  .border-selected-blue {
    border: 4px solid var(--khartis-additions-focus-suggestions, #0072c3);
  }

  /* Unselected default: 1px solid #82cfff (border-tile-01-suggestions) */
  .border-unselected-blue {
    border: 1px solid
      var(--khartis-additions-border-tile-01-suggestions, #82cfff);
  }

  .card-left {
    /* Fixed 120px width per Figma design */
    width: 120px;
    min-width: 120px;
    flex-shrink: 0;
    padding: 1rem 0.75rem;
    border-right: 1px solid var(--cds-layer-accent);
    gap: 0.25rem;
    /* layer-02-suggestions = white for preview area */
    background-color: var(--khartis-additions-layer-02-suggestions, #ffffff);
  }

  #kh-projection-card.vertical .card-left {
    width: 100%;
    min-width: auto;
    border-right: none;
    border-bottom: 1px solid var(--cds-layer-accent);
  }

  .card-left h4 {
    font-size: 0.9rem;
    line-height: 1.2;
    margin: 0.25rem 0 0;
  }

  .card-right {
    flex: 1 1 auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.75rem;
  }

  #kh-projection-card.vertical .card-right {
    width: 100%;
  }

  #kh-projection-card:hover:not(.opacity-50)
    .card-right.bg-layer-01-suggestions {
    background-color: var(--cds-medium-blue, #a8e2ff);
  }
  #kh-projection-card:hover:not(.opacity-50) .card-right.variant-gray {
    background-color: var(--cds-medium-gray, #e0e0e0);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
    /* text-primary-suggestions: #003a6d */
    color: var(--khartis-additions-text-primary-suggestions, #003a6d);
  }

  .card-body .subtitle {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    /* text-secondary-suggestions: #00539a */
    color: var(--khartis-additions-text-secondary-suggestions, #00539a);
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 9999px;
    background: var(--cds-blue);
    color: var(--cds-inverse-01);
  }

  #kh-projection-card:focus {
    outline: none;
  }
  .text-sm {
    font-size: 0.7rem;
  }
  .mt-2 {
    margin-top: 0.5rem;
  }
  .ml-1 {
    margin-left: 0.25rem;
  }
  .centered-flex-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .opacity-50 {
    opacity: 0.5;
  }
</style>
