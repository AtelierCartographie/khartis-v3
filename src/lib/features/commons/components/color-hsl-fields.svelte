<script module lang="ts">
  export type ColorPayload = {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  };
</script>

<script lang="ts">
  import {
    hexToHsl,
    hslToHex,
    normalizeHexInput
  } from '$lib/features/commons/utils/color-utils';
  import { m } from '$lib/paraglide/messages';
  import { Button, Column, Grid, Row, Slider } from 'carbon-components-svelte';
  import { Eyedropper } from 'carbon-icons-svelte';
  import { EVENT, KEY } from '../constants/dom.constants';
  import CompactNumberInput from './compact-number-input.svelte';
  import {
    type CarbonValueEvent,
    readCarbonNumberValue
  } from '$lib/features/commons/utils/carbon-events.utils';

  // The EyeDropper API is Chromium-only and missing from the TypeScript DOM lib.
  type EyeDropperConstructor = new () => {
    open: () => Promise<{ sRGBHex: string }>;
  };

  interface Props {
    hex?: string;
    hue?: number;
    saturation?: number;
    lightness?: number;
    /** Told when the screen colour picker opens and closes. */
    onpickingchange?: (picking: boolean) => void;
    /**
     * `dropdown`: hex code next to a preview and an eyedropper icon.
     * `inline`: hex code, then a labelled eyedropper button; the panel
     * around shows the preview.
     */
    variant?: 'dropdown' | 'inline';
    /** Called on each change the user makes, never on a value set from outside. */
    onchange?: (color: ColorPayload) => void;
  }

  let {
    hex = $bindable('#ffffff'),
    hue = $bindable(0),
    saturation = $bindable(0),
    lightness = $bindable(100),
    variant = 'dropdown',
    onchange,
    onpickingchange
  }: Props = $props();

  const EyeDropperApi = (globalThis as { EyeDropper?: EyeDropperConstructor })
    .EyeDropper;
  const idPrefix = `cp-${Math.random().toString(36).slice(2, 8)}`;

  // Each track previews the colour its own axis reaches, the other two held.
  const saturationTrack = $derived(
    `linear-gradient(90deg, hsl(${hue} 0% ${lightness}%), hsl(${hue} 100% ${lightness}%))`
  );
  const lightnessTrack = $derived(
    `linear-gradient(90deg, hsl(${hue} ${saturation}% 0%), hsl(${hue} ${saturation}% 50%), hsl(${hue} ${saturation}% 100%))`
  );

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function emit(): void {
    onchange?.({ hex, hue, saturation, lightness });
  }

  function setHsl(
    nextHue: number,
    nextSaturation: number,
    nextLightness: number
  ): void {
    hue = clamp(Math.round(nextHue), 0, 359);
    saturation = clamp(Math.round(nextSaturation), 0, 100);
    lightness = clamp(Math.round(nextLightness), 0, 100);
    hex = hslToHex(hue, saturation, lightness);
    emit();
  }

  function setFromHex(normalizedHex: string): void {
    const parsed = hexToHsl(normalizedHex);
    hex = normalizedHex;
    hue = parsed.hue;
    saturation = parsed.saturation;
    lightness = parsed.lightness;
    emit();
  }

  function readNumberInput(event: Event, fallback: number): number {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function handleHexInput(event: Event): void {
    const rawValue = (event.currentTarget as HTMLInputElement).value;
    const normalizedHex = normalizeHexInput(rawValue);
    if (!normalizedHex) {
      hex = rawValue;
      return;
    }
    setFromHex(normalizedHex);
  }

  async function pickScreenColor(): Promise<void> {
    if (!EyeDropperApi) {
      return;
    }

    // Escape cancels the pick; it must not also close the picker or the
    // styling tool, whose shortcuts listen on the document.
    const swallowEscape = (event: KeyboardEvent) => {
      if (event.key === KEY.ESCAPE) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener(EVENT.KEYDOWN, swallowEscape, { capture: true });
    onpickingchange?.(true);
    try {
      const { sRGBHex } = await new EyeDropperApi().open();
      const normalizedHex = normalizeHexInput(sRGBHex);
      if (normalizedHex) {
        setFromHex(normalizedHex);
      }
    } catch {
      // Escape aborts the pick: the current colour stays.
    } finally {
      onpickingchange?.(false);
      window.removeEventListener(EVENT.KEYDOWN, swallowEscape, {
        capture: true
      });
    }
  }
</script>

{#snippet channel(
  key: 'hue' | 'saturation' | 'lightness',
  label: string,
  max: number,
  value: number,
  className: string,
  track: string | undefined
)}
  {@const setChannel = (next: number) => {
    if (key === 'hue') setHsl(next, saturation, lightness);
    else if (key === 'saturation') setHsl(hue, next, lightness);
    else setHsl(hue, saturation, next);
  }}
  <Row noGutter>
    <Column sm={3} md={6} lg={variant === 'inline' ? 12 : 13}>
      <div class="slider {className}" style:--slider-track={track}>
        <Slider
          min={0}
          max={max}
          step={1}
          value={value}
          hideTextInput
          labelText={label}
          on:input={(event: CarbonValueEvent) =>
            setChannel(readCarbonNumberValue(event, value))}
        />
      </div>
    </Column>

    <Column sm={1} md={2} lg={variant === 'inline' ? 4 : 3}>
      <div class="input-wrapper">
        {#if variant === 'inline'}
          <!-- On the white panel, the field of the other sliders of the app. -->
          <CompactNumberInput
            id="{idPrefix}-{key}"
            ariaLabel={label}
            min={0}
            max={max}
            value={value}
            showSteppers={false}
            onchange={setChannel}
          />
        {:else}
          <input
            id="{idPrefix}-{key}"
            class="number"
            type="number"
            aria-label={label}
            min={0}
            max={max}
            step={1}
            value={value}
            inputmode="numeric"
            oninput={(event: Event) =>
              setChannel(readNumberInput(event, value))}
          />
        {/if}
      </div>
    </Column>
  </Row>
{/snippet}

<Grid condensed class={variant === 'dropdown' ? 'mt-5' : 'color-fields-inline'}>
  {@render channel('hue', m.color_hue(), 359, hue, 'rainbow', undefined)}
  {@render channel(
    'saturation',
    m.color_saturation(),
    100,
    saturation,
    'gradient',
    saturationTrack
  )}
  {@render channel(
    'lightness',
    m.color_brightness(),
    100,
    lightness,
    'gradient',
    lightnessTrack
  )}

  {#if variant === 'dropdown'}
    <Row noGutter class="mt-4">
      <Column sm={2} md={4} lg={8}>
        <label class="form-label mb-2" for="{idPrefix}-hex"
          >{m.color_hex_code()}</label
        >
        <input
          id="{idPrefix}-hex"
          class="hex"
          value={hex.toUpperCase()}
          oninput={handleHexInput}
        />
      </Column>

      <Column sm={2} md={4} lg={8}>
        <span class="form-label mb-2">{m.color_preview()}</span>
        <div class="preview-row">
          <div class="preview" style={`background:${hex}`}></div>
          {#if EyeDropperApi}
            <Button
              kind="ghost"
              size="field"
              icon={Eyedropper}
              iconDescription={m.color_pick_from_screen()}
              tooltipPosition="top"
              tooltipAlignment="end"
              onclick={pickScreenColor}
            />
          {/if}
        </div>
      </Column>
    </Row>
  {:else}
    <Row noGutter class="mt-4">
      <Column>
        <label class="form-label mb-2" for="{idPrefix}-hex"
          >{m.color_hex_code()}</label
        >
        <input
          id="{idPrefix}-hex"
          class="hex inline"
          value={hex.toUpperCase()}
          oninput={handleHexInput}
        />
      </Column>
    </Row>
    {#if EyeDropperApi}
      <Row noGutter class="mt-4">
        <Column>
          <Button
            kind="tertiary"
            size="small"
            class="pick-button"
            icon={Eyedropper}
            onclick={pickScreenColor}>{m.color_pick_from_screen()}</Button
          >
        </Column>
      </Row>
    {/if}
  {/if}
</Grid>

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

  .slider.gradient :global(.bx--slider__track) {
    background: var(--slider-track);
  }

  .slider.rainbow :global(.bx--slider__filled-track),
  .slider.gradient :global(.bx--slider__filled-track) {
    background: transparent;
  }

  .slider.rainbow :global(.bx--slider__track),
  .slider.gradient :global(.bx--slider__track) {
    height: var(--cds-spacing-04);
    border-radius: var(--cds-spacing-02);
    box-shadow: inset 0 0 0 1px var(--cds-border-subtle-01, #c6c6c6);
  }

  .slider.rainbow :global(.bx--slider__thumb),
  .slider.gradient :global(.bx--slider__thumb) {
    width: var(--cds-spacing-05);
    height: var(--cds-spacing-05);
    background: var(--cds-field-01);
    box-shadow:
      0 0 0 2px var(--cds-text-01),
      0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .input-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }

  .input-wrapper .number {
    width: 100%;
    height: var(--kh-size-sm);
    min-width: unset;
    padding: 0 var(--cds-spacing-03);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong);
    background: var(--cds-ui-02);
    color: var(--cds-text-01);
    font-family: var(--cds-code-01-font-family);
    line-height: var(--cds-body-short-01-line-height);
    border-radius: 0;
    box-sizing: border-box;
    font-weight: 600;
  }

  .input-wrapper .number:focus {
    border-bottom-color: var(--cds-border-strong);
  }

  .input-wrapper .number:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: -2px;
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
    height: var(--kh-size-md);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong);
    padding: 0 var(--cds-spacing-03);
    background: var(--cds-field-02);
    color: var(--cds-text-01);
    font-family: var(--cds-code-01-font-family);
    font-size: var(--cds-body-short-01-font-size);
    text-align: center;
    font-weight: normal;
    box-sizing: border-box;
  }

  /* Inline, the fields line up with the panel around them. */
  :global(.bx--grid.color-fields-inline) {
    max-width: none;
    margin-inline: 0;
    padding-inline: 0;
  }

  :global(.bx--grid.color-fields-inline > .bx--row) {
    margin-inline: 0;
  }

  /* The text field of the app on a white panel (compact-number-input.svelte). */
  .hex.inline {
    height: var(--kh-size-sm);
    padding: 0 var(--cds-spacing-04, 12px);
    background: var(--cds-field-01, #f4f4f4);
    border-bottom-color: var(--cds-border-strong-01, #8d8d8d);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    letter-spacing: 0.16px;
    text-align: left;
    transition: border-bottom-color 0.1s ease;
  }

  .hex.inline:focus-visible {
    outline: none;
    border-bottom-color: var(--cds-focus, #0f62fe);
    box-shadow: inset 0 -1px 0 0 var(--cds-focus, #0f62fe);
  }

  .hex:focus-visible {
    outline: 2px solid var(--cds-focus);
    outline-offset: -2px;
  }

  .preview-row {
    display: flex;
    align-items: stretch;
  }

  .preview {
    width: 100%;
    height: var(--kh-size-md);
    border: 1px solid var(--cds-ui-04);
    box-sizing: border-box;
  }

  :global(.pick-button.bx--btn) {
    width: 100%;
    max-width: 100%;
  }
</style>
