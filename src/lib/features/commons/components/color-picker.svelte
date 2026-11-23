<script lang="ts">
  import { resolveColorPickerDropdownPosition } from '$lib/features/commons/utils/color-picker-position';
  import {
    hexToHsl,
    hslToHex,
    normalizeHexInput
  } from '$lib/features/commons/utils/color-utils';
  import ColorHslFields, { type ColorPayload } from './color-hsl-fields.svelte';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import { portal } from '$lib/features/commons/utils/portal';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { m } from '$lib/paraglide/messages';
  import { Button } from 'carbon-components-svelte';
  import { ArrowRight, ChevronDown } from 'carbon-icons-svelte';
  import { cubicOut } from 'svelte/easing';
  import type { TransitionConfig } from 'svelte/transition';
  import { motionDuration } from '$lib/features/commons/utils/step-transition.svelte';
  import clsx from 'clsx';
  import { EVENT, KEY } from '../constants/dom.constants';

  let {
    hex = '#fff',
    hue = 0,
    saturation = 0,
    lightness = 100,
    livePreview = false,
    disabled = false,
    exclusive = false,
    onCancel = () => {},
    onPreview = (_color: ColorPayload) => {},
    onValidate = (_color: ColorPayload) => {},
    onBeforeOpen = () => {},
    triggerLabel = '',
    triggerAriaLabel = '',
    triggerTitle = ''
  } = $props();

  let colorOpen = $state(false);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let dropdownEl = $state<HTMLDivElement | null>(null);
  let dropdownPosition = $state({ top: 0, left: 0, width: 0, maxHeight: 0 });
  let openUpward = $state(false);
  let initialColor: ColorPayload | null = null;
  let isPickingScreenColor = false;
  const contextualSurfaceId =
    createExclusiveContextualSurfaceId('color-picker');
  const effectiveTriggerAriaLabel = $derived(
    triggerAriaLabel || triggerLabel || undefined
  );
  const effectiveTriggerTitle = $derived(
    triggerTitle || triggerAriaLabel || triggerLabel || undefined
  );

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function buildColorFromHsl(
    hueValue: number,
    saturationValue: number,
    lightnessValue: number
  ): ColorPayload {
    const nextHue = clamp(Math.round(hueValue), 0, 359);
    const nextSaturation = clamp(Math.round(saturationValue), 0, 100);
    const nextLightness = clamp(Math.round(lightnessValue), 0, 100);

    return {
      hex: hslToHex(nextHue, nextSaturation, nextLightness),
      hue: nextHue,
      saturation: nextSaturation,
      lightness: nextLightness
    };
  }

  function applyColor(color: ColorPayload): void {
    hex = color.hex;
    hue = color.hue;
    saturation = color.saturation;
    lightness = color.lightness;
  }

  function getValidatedColor(): ColorPayload {
    const normalizedHex = normalizeHexInput(hex);
    if (normalizedHex) {
      return {
        hex: normalizedHex,
        ...hexToHsl(normalizedHex)
      };
    }

    return buildColorFromHsl(hue, saturation, lightness);
  }

  // Closing without validating restores the colour the picker opened with,
  // in the fields and the trigger swatch as on the map when previewed.
  function revertPreviewState(): void {
    if (!initialColor) {
      return;
    }

    const nextColor = initialColor;
    applyColor(nextColor);
    if (livePreview) {
      onPreview(nextColor);
    }
  }

  function updateDropdownPosition(): void {
    if (!triggerEl) {
      return;
    }

    const nextPosition = resolveColorPickerDropdownPosition({
      triggerRect: triggerEl.getBoundingClientRect(),
      dropdownHeight: dropdownEl?.offsetHeight ?? 400,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });

    openUpward = nextPosition.openUpward;
    dropdownPosition = {
      top: nextPosition.top,
      left: nextPosition.left,
      width: nextPosition.width,
      maxHeight: nextPosition.maxHeight
    };
  }

  $effect(() => {
    if (
      hue === undefined ||
      saturation === undefined ||
      lightness === undefined
    ) {
      return;
    }

    const nextColor = buildColorFromHsl(hue, saturation, lightness);
    hex = nextColor.hex;

    if (colorOpen && livePreview) {
      onPreview(nextColor);
    }
  });

  function handleOutsideClick() {
    if (isPickingScreenColor) {
      return;
    }
    revertPreviewState();
    colorOpen = false;
  }

  function closeColorPickerFromKeyboard(): void {
    revertPreviewState();
    colorOpen = false;
    triggerEl?.focus();
  }

  function toggleColorPicker() {
    if (disabled) {
      return;
    }

    if (!colorOpen) {
      onBeforeOpen();
      // Placed before it shows, so that it unfolds from its field.
      updateDropdownPosition();
    }

    colorOpen = !colorOpen;
  }

  // Unfolds from its field like the Carbon lists (max-height, 110 ms): the
  // menu is revealed downward, or upward when it opens above the field.
  function unfoldMenu(_node: Element): TransitionConfig {
    const upward = openUpward;
    return {
      duration: motionDuration(110),
      easing: cubicOut,
      css: (t) =>
        `clip-path: inset(${upward ? (1 - t) * 100 : 0}% 0 ${upward ? 0 : (1 - t) * 100}% 0); opacity: ${Math.min(1, t * 2)};`
    };
  }

  $effect(() => {
    if (!colorOpen || !exclusive) {
      return;
    }

    return engageExclusiveContextualSurface(contextualSurfaceId, () => {
      revertPreviewState();
      colorOpen = false;
    });
  });

  $effect(() => {
    if (colorOpen) {
      if (!initialColor) {
        initialColor = getValidatedColor();
      }
      updateDropdownPosition();

      const rafId = requestAnimationFrame(updateDropdownPosition);
      window.addEventListener(EVENT.SCROLL, updateDropdownPosition, true);
      window.addEventListener(EVENT.RESIZE, updateDropdownPosition);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener(EVENT.SCROLL, updateDropdownPosition, true);
        window.removeEventListener(EVENT.RESIZE, updateDropdownPosition);
      };
    }

    initialColor = null;
  });

  $effect(() => {
    if (!colorOpen) {
      return;
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (event.key !== KEY.ESCAPE) {
        return;
      }

      event.preventDefault();
      closeColorPickerFromKeyboard();
    }

    document.addEventListener(EVENT.KEYDOWN, handleKeydown);

    return () => {
      document.removeEventListener(EVENT.KEYDOWN, handleKeydown);
    };
  });
</script>

<div
  id="khartis-color-picker"
  class={clsx('color-picker-wrap', { 'is-disabled': disabled })}
  use:clickOutside={{
    enabled: colorOpen,
    excludeSelectors: ['#khartis-color-picker-dropdown']
  }}
  onoutsideclick={handleOutsideClick}
>
  {#if triggerLabel}
    <span class="form-label">{triggerLabel}</span>
  {/if}

  <button
    class="color-trigger"
    type="button"
    disabled={disabled}
    onclick={toggleColorPicker}
    aria-expanded={colorOpen}
    aria-label={effectiveTriggerAriaLabel}
    title={effectiveTriggerTitle}
    bind:this={triggerEl}
  >
    <div class="swatch" style={`background:${hex}`}></div>
    <span class:open={colorOpen} class="chevron"><ChevronDown size={20} /></span
    >
  </button>

  {#if colorOpen}
    <div
      id="khartis-color-picker-dropdown"
      class="color-dropdown"
      class:open-upward={openUpward}
      style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {dropdownPosition.width}px; max-height: {dropdownPosition.maxHeight}px;"
      bind:this={dropdownEl}
      use:portal
      transition:unfoldMenu
    >
      <ColorHslFields
        variant="dropdown"
        bind:hex={hex}
        bind:hue={hue}
        bind:saturation={saturation}
        bind:lightness={lightness}
        onpickingchange={(picking) => (isPickingScreenColor = picking)}
      />
      <div class="dropdown-actions">
        <Button
          kind="tertiary"
          size="small"
          onclick={() => {
            revertPreviewState();
            onCancel();
            colorOpen = false;
          }}>{m.button_cancel()}</Button
        >
        <Button
          kind="primary"
          size="small"
          icon={ArrowRight}
          onclick={() => {
            const validatedColor = getValidatedColor();
            applyColor(validatedColor);
            onValidate(validatedColor);
            colorOpen = false;
          }}
        >
          {m.button_validate()}
        </Button>
      </div>
    </div>
  {/if}
</div>

<style>
  .form-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
    margin-bottom: var(--kh-gap-label);
  }

  .color-picker-wrap {
    position: relative;
  }

  .color-trigger {
    width: 100%;
    height: var(--kh-size-sm);
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    background: var(--cds-field-01);
    border: 0;
    border-bottom: 1px solid var(--cds-ui-04);
    padding: 0 var(--cds-spacing-05) 0 var(--cds-spacing-03);
    cursor: pointer;
    color: var(--cds-text-01);
    text-align: left;
  }

  .color-trigger:focus {
    outline: 2px solid var(--cds-focus);
    outline-offset: -2px;
  }

  .is-disabled .form-label {
    color: var(--cds-text-disabled, rgba(22, 22, 22, 0.25));
  }

  .is-disabled .color-trigger {
    border-bottom-color: var(--cds-border-disabled, #c6c6c6);
    cursor: not-allowed;
    pointer-events: none;
  }

  .swatch {
    width: 100%;
    margin-right: 20px;
    height: 1.25rem;
    border: 1px solid var(--cds-ui-04);
  }

  .chevron {
    position: absolute;
    right: var(--cds-spacing-03);
    transform: rotate(0deg);
    transition: transform 120ms;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .color-dropdown {
    position: fixed;
    z-index: var(--z-overlay);
    background: var(--cds-field-01);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--cds-ui-04);
    box-sizing: border-box;
    padding: var(--cds-spacing-05);
    max-width: calc(100vw - 2 * var(--cds-spacing-05));
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .color-dropdown.open-upward {
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.2);
  }

  /* Two equal columns on the width of the fields, like the hex code and its
     preview above. */
  .dropdown-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cds-spacing-05);
    margin-top: var(--cds-spacing-05);
  }

  .dropdown-actions :global(.bx--btn) {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  /* Same icon room as the eyedropper button (color-hsl-fields.svelte). */
  .dropdown-actions :global(.bx--btn--primary) {
    padding-right: calc(var(--cds-spacing-05) * 2 + var(--cds-spacing-03));
  }
</style>
