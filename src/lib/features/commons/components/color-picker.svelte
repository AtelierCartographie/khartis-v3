<script lang="ts">
  import { resolveColorPickerDropdownPosition } from '$lib/features/commons/utils/color-picker-position';
  import { hexToHsl, hslToHex } from '$lib/features/commons/utils/color-utils';
  import { clickOutside } from '$lib/features/commons/utils/click-outside';
  import {
    createExclusiveContextualSurfaceId,
    engageExclusiveContextualSurface
  } from '$lib/features/commons/utils/contextual-surface-coordinator';
  import { m } from '$lib/paraglide/messages';
  import { Button, Column, Grid, Row, Slider } from 'carbon-components-svelte';
  import { ChevronDown } from 'carbon-icons-svelte';
  import clsx from 'clsx';
  import { EVENT } from '../constants/dom.constants';

  type ColorPayload = {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  };

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
    triggerLabel = ''
  } = $props();

  let colorOpen = $state(false);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let dropdownEl = $state<HTMLDivElement | null>(null);
  let dropdownPosition = $state({ top: 0, left: 0, width: 0, maxHeight: 0 });
  let openUpward = $state(false);
  let initialColor: ColorPayload | null = null;
  const contextualSurfaceId =
    createExclusiveContextualSurfaceId('color-picker');

  function portal(node: HTMLElement): { destroy: () => void } {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      }
    };
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeHexInput(rawHex: string): string | null {
    const sanitized = rawHex.trim().replace(/^#/, '');

    if (/^[0-9a-fA-F]{3}$/.test(sanitized)) {
      const expanded = sanitized
        .split('')
        .map((char) => `${char}${char}`)
        .join('');
      return `#${expanded.toUpperCase()}`;
    }

    if (/^[0-9a-fA-F]{6}$/.test(sanitized)) {
      return `#${sanitized.toUpperCase()}`;
    }

    return null;
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

  function revertPreviewState(): void {
    if (!livePreview || !initialColor) {
      return;
    }

    const nextColor = initialColor;
    applyColor(nextColor);
    onPreview(nextColor);
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
    revertPreviewState();
    colorOpen = false;
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
    onclick={() => !disabled && (colorOpen = !colorOpen)}
    aria-expanded={colorOpen}
    aria-label={triggerLabel || undefined}
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
    >
      <Grid condensed class="mt-5 mb-5">
        <Row noGutter>
          <Column sm={3} md={6} lg={13}>
            <div class="slider rainbow">
              <Slider
                min={0}
                max={359}
                step={1}
                bind:value={hue}
                hideTextInput
                labelText={m.color_hue()}
              />
            </div>
          </Column>

          <Column sm={1} md={2} lg={3}>
            <div class="input-wrapper">
              <input
                id="cp-hue-num"
                class="number"
                type="number"
                min={0}
                max={359}
                step={1}
                bind:value={hue}
                inputmode="numeric"
              />
            </div>
          </Column>
        </Row>

        <Row noGutter>
          <Column sm={3} md={6} lg={13}>
            <div class="slider">
              <Slider
                min={0}
                max={100}
                step={1}
                bind:value={saturation}
                hideTextInput
                labelText={m.color_saturation()}
              />
            </div>
          </Column>

          <Column sm={1} md={2} lg={3}>
            <div class="input-wrapper">
              <input
                id="cp-sat-num"
                class="number"
                type="number"
                min={0}
                max={100}
                step={1}
                bind:value={saturation}
                inputmode="numeric"
              />
            </div>
          </Column>
        </Row>

        <Row noGutter>
          <Column sm={3} md={6} lg={13}>
            <div class="slider">
              <Slider
                min={0}
                max={100}
                step={1}
                bind:value={lightness}
                hideTextInput
                labelText={m.color_brightness()}
              />
            </div>
          </Column>

          <Column sm={1} md={2} lg={3}>
            <div class="input-wrapper">
              <input
                id="cp-light-num"
                class="number"
                type="number"
                min={0}
                max={100}
                step={1}
                bind:value={lightness}
                inputmode="numeric"
              />
            </div>
          </Column>
        </Row>

        <Row noGutter class="mt-4">
          <Column sm={2} md={4} lg={8}>
            <label class="form-label mb-2" for="cp-hex"
              >{m.color_hex_code()}</label
            >

            <input
              id="cp-hex"
              class="hex"
              bind:value={hex}
              oninput={(e: InputEvent) => {
                const target = e.target as HTMLInputElement;
                const rawValue = target.value;
                const normalizedHex = normalizeHexInput(rawValue);
                if (!normalizedHex) {
                  hex = rawValue;
                  return;
                }

                const parsedColor = hexToHsl(normalizedHex);
                hex = normalizedHex;
                hue = parsedColor.hue;
                saturation = parsedColor.saturation;
                lightness = parsedColor.lightness;
              }}
            />
          </Column>

          <Column sm={2} md={4} lg={8}>
            <span class="form-label mb-2">{m.color_preview()}</span>
            <div class="preview" style={`background:${hex}`}></div>
          </Column>
        </Row>

        <Row noGutter class="mt-4">
          <Column sm={2} md={4} lg={8}>
            <Button
              kind="secondary"
              size="field"
              class="action-button"
              onclick={() => {
                revertPreviewState();
                onCancel();
                colorOpen = false;
              }}>{m.button_cancel()}</Button
            >
          </Column>

          <Column sm={2} md={4} lg={8}>
            <Button
              kind="primary"
              size="field"
              class="action-button"
              onclick={() => {
                const validatedColor = getValidatedColor();
                applyColor(validatedColor);
                onValidate(validatedColor);
                colorOpen = false;
              }}
            >
              {m.button_apply()}
            </Button>
          </Column>
        </Row>
      </Grid>
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
    margin-bottom: var(--cds-spacing-02);
  }

  .color-picker-wrap {
    position: relative;
  }

  .color-trigger {
    margin-top: var(--cds-spacing-03);
    width: 100%;
    height: 2.5rem;
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
    max-width: calc(100vw - 2 * var(--cds-spacing-05));
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .color-dropdown.open-upward {
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.2);
  }

  .slider {
    width: 100%;
  }

  .slider :global(.bx--slider) {
    min-width: 160px !important;
  }

  .slider :global(.bx--slider__track) {
    background: var(--cds-ui-03);
  }

  .slider :global(.bx--slider__filled-track) {
    background: var(--cds-text-01);
  }

  .slider.rainbow :global(.bx--slider__track) {
    background: linear-gradient(
      90deg,
      red,
      yellow,
      lime,
      cyan,
      blue,
      magenta,
      red
    );
  }

  .slider.rainbow :global(.bx--slider__filled-track) {
    background: transparent;
  }

  .input-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }

  .input-wrapper .number {
    width: 100%;
    height: 32px;
    min-width: unset;
    padding: 0 var(--cds-spacing-03);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong);
    background: var(--cds-ui-02);
    color: var(--cds-text-01);
    font-weight: normal;
    font-family: var(--cds-code-01-font-family);
    line-height: var(--cds-body-short-01-line-height);
    border-radius: 0;
    box-sizing: border-box;
    font-weight: 600;
  }

  .input-wrapper .number:focus {
    outline: none;
    border-bottom-color: var(--cds-border-strong);
  }

  .input-wrapper .number:disabled {
    background: var(--cds-ui-03);
    color: var(--cds-text-02);
    cursor: not-allowed;
  }

  input[type='number']::-webkit-outer-spin-button,
  input[type='number']::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type='number'] {
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .hex {
    width: 100%;
    height: 2.5rem;
    border: none;
    border-bottom: 1px solid var(--cds-border-strong);
    padding: 0 var(--cds-spacing-03);
    background: var(--cds-field-02);
    color: var(--cds-text-01);
    font-family: var(--cds-code-01-font-family);
    font-size: var(--cds-body-short-01-font-size);
    text-align: center;
    font-weight: normal;
  }

  .preview {
    width: 100%;
    height: 2.5rem;
    border: 1px solid var(--cds-ui-04);
  }

  .hex,
  .preview {
    box-sizing: border-box;
  }

  .color-dropdown :global(.action-button) {
    width: 100%;
    max-width: 100%;
  }
</style>
