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
     * `inline`: in a white panel that shows the preview itself.
     * `dropdown`: on the grey menu of a colour field, with its own preview.
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
    <Column sm={3} md={6} lg={12}>
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

    <Column sm={1} md={2} lg={4}>
      <div class="input-wrapper">
        <CompactNumberInput
          id="{idPrefix}-{key}"
          ariaLabel={label}
          min={0}
          max={max}
          value={value}
          showSteppers={false}
          height={variant === 'dropdown' ? 'var(--kh-size-md)' : undefined}
          onchange={setChannel}
        />
      </div>
    </Column>
  </Row>
{/snippet}

<div class="color-fields" class:on-menu={variant === 'dropdown'}>
  <Grid condensed class="color-fields-grid">
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

    <Row noGutter class="mt-4">
      <Column>
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
    </Row>

    {#if EyeDropperApi}
      <Row noGutter class="mt-4">
        <Column>
          <Button
            kind="tertiary"
            size={variant === 'dropdown' ? 'field' : 'small'}
            class="pick-button"
            icon={Eyedropper}
            onclick={pickScreenColor}>{m.color_pick_from_screen()}</Button
          >
        </Column>
      </Row>
    {/if}

    {#if variant === 'dropdown'}
      <Row noGutter class="mt-4">
        <Column>
          <span class="form-label mb-2">{m.color_preview()}</span>
          <div class="preview" style={`background:${hex}`}></div>
        </Column>
      </Row>
    {/if}
  </Grid>
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

  /* The fields line up with what is around them. */
  .color-fields :global(.bx--grid.color-fields-grid) {
    max-width: none;
    margin-inline: 0;
    padding-inline: 0;
  }

  .color-fields :global(.bx--grid.color-fields-grid > .bx--row) {
    margin-inline: 0;
  }

  /* The text field of the app (compact-number-input.svelte): grey on a white
     panel, white on the grey menu of a colour field. */
  .hex {
    width: 100%;
    height: var(--kh-size-md);
    padding: 0 var(--cds-spacing-05, 16px);
    border: none;
    border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
    background: var(--cds-field-01, #f4f4f4);
    color: var(--cds-text-primary, #161616);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    letter-spacing: 0.16px;
    box-sizing: border-box;
    transition: border-bottom-color 0.1s ease;
  }

  .hex:focus-visible {
    outline: none;
    border-bottom-color: var(--cds-focus, #0f62fe);
    box-shadow: inset 0 -1px 0 0 var(--cds-focus, #0f62fe);
  }

  .color-fields:not(.on-menu) .hex {
    height: var(--kh-size-sm);
    padding: 0 var(--cds-spacing-04, 12px);
  }

  .on-menu .hex,
  .on-menu :global(.compact-number-input) {
    background-color: var(--cds-field-02, #ffffff);
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
