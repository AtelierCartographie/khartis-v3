<script lang="ts">
  import { RadioButton } from 'carbon-components-svelte';
  import { Earth } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import type { Snippet } from 'svelte';

  interface ProjectCardProps {
    title: string;
    subtitle: string;
    selected?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'blue' | 'gray';
    onclick?: () => void;
    footer?: Snippet;
  }

  let {
    title,
    subtitle,
    selected = false,
    disabled = false,
    variant = 'default',
    onclick,
    footer
  }: ProjectCardProps = $props();

  function handleCardClick() {
    if (!disabled && onclick) {
      onclick();
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if ((event.key === 'Enter' || event.key === ' ') && !disabled) {
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
    clsx('flex flex-col justify-between', {
      'border-2 border-dark-gray': selected && (disabled || isGrayVariant),
      'border-2 border-blue': selected && !disabled && isBlueVariant,
      'border-2 border-pale-blue': selected && !disabled && isDefaultVariant,
      'border border-medium-gray': !selected && (disabled || isGrayVariant),
      'border border-medium-blue': !selected && !disabled && isBlueVariant,
      'border border-pale-blue': !selected && !disabled && isDefaultVariant,
      'opacity-50': disabled,
      'cursor-pointer': !disabled
    })
  );

  const topSectionClasses = $derived(
    clsx('p-5 centered-flex-col top-section flex-1', {
      'variant-gray': isGrayVariant,
      'color-text-01': disabled || isGrayVariant,
      'color-blue': !disabled && (isBlueVariant || isDefaultVariant)
    })
  );

  const bottomSectionClasses = $derived(
    clsx('pb-5 pl-5 pt-5 pr-2 bottom-section', {
      'variant-gray': isGrayVariant,
      'bg-light-gray color-text-01': disabled || isGrayVariant,
      'bg-pale-blue color-dark-blue':
        !disabled && (isBlueVariant || isDefaultVariant)
    })
  );

  const getColorValue = (normalColor: string, disabledColor: string) =>
    disabled ? disabledColor : normalColor;

  const CSS_COLORS = {
    darkGray: 'var(--cds-dark-gray)',
    blue: 'var(--cds-blue)',
    textGray: 'var(--cds-text-gray)',
    darkBlue: 'var(--cds-dark-blue)',
    text01: 'var(--cds-text-01)',
    white: 'white'
  } as const;

  const iconColor = $derived(
    getColorValue(
      isGrayVariant ? CSS_COLORS.text01 : CSS_COLORS.blue,
      CSS_COLORS.darkGray
    )
  );

  const calendarColor = $derived(
    getColorValue(
      isGrayVariant ? CSS_COLORS.text01 : CSS_COLORS.darkBlue,
      CSS_COLORS.textGray
    )
  );

  const iconHoverColor = CSS_COLORS.white;
  const calendarHoverColor = CSS_COLORS.white;
</script>

<div
  id="kh-card"
  class={cardClasses}
  role="button"
  tabindex={disabled ? -1 : 0}
  onclick={handleCardClick}
  onkeydown={handleKeyDown}
  style="--icon-color: {iconColor}; --calendar-color: {calendarColor}; --icon-hover-color: {iconHoverColor}; --calendar-hover-color: {calendarHoverColor};"
>
  <div class={topSectionClasses}>
    <Earth
      size={32}
      style="color: var(--icon-color); fill: var(--icon-color);"
    />

    <h4 class="mt-2">16:9</h4>

    <span class="text-sm">{subtitle}</span>
  </div>

  <div class={bottomSectionClasses}>
    <div class="flex items-start justify-between">
      <h6 class="flex-1 pr-2 title-text">{title}</h6>

      <div class="ml-2 radio-button-wrapper">
        <RadioButton
          checked={selected}
          disabled={disabled}
          onclick={handleRadioClick}
        />
      </div>
    </div>

    <div class="mt-3">
      {@render footer?.()}
    </div>
  </div>
</div>

<style>
  #kh-card {
    min-width: 180px;
    width: 180px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .title-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .radio-button-wrapper {
    flex-shrink: 0;
  }

  #kh-card:hover:not(.opacity-50) .top-section {
    background-color: var(--cds-medium-blue);
  }

  #kh-card:hover:not(.opacity-50) .top-section.variant-gray {
    background-color: var(--cds-medium-gray);
  }

  #kh-card:hover:not(.opacity-50) .bottom-section {
    background-color: var(--cds-medium-blue);
  }

  #kh-card:hover:not(.opacity-50) .bottom-section.variant-gray {
    background-color: var(--cds-medium-gray);
  }

  #kh-card:hover:not(.opacity-50) {
    --icon-color: var(--icon-hover-color);
    --calendar-color: var(--calendar-hover-color);
  }

  #kh-card:focus {
    outline: none;
  }

  .text-sm {
    font-size: 0.875rem;
  }

  .opacity-50 {
    opacity: 0.5;
  }
</style>
