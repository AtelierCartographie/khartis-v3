<script lang="ts">
  import { Modal, TextInput, Slider } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    open?: boolean;
    color?: string;
    onclose?: () => void;
    onselect?: (color: string) => void;
  }

  let {
    open = $bindable(false),
    color = '#ffffff',
    onclose,
    onselect
  }: Props = $props();

  let hue = $state(0);
  let saturation = $state(0);
  let lightness = $state(100);
  let hexValue = $state('#ffffff');

  $effect(() => {
    if (color && open) {
      hexValue = color;
      const [h, s, l] = hexToHsl(color);
      hue = h;
      saturation = s;
      lightness = l;
    }
  });

  function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
      g = 0,
      b = 0;

    if (0 <= h && h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (60 <= h && h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (120 <= h && h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (180 <= h && h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (240 <= h && h < 300) {
      r = x;
      g = 0;
      b = c;
    } else if (300 <= h && h < 360) {
      r = c;
      g = 0;
      b = x;
    }

    const toHex = (n: number) =>
      Math.round((n + m) * 255)
        .toString(16)
        .padStart(2, '0');

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function hexToHsl(hex: string): [number, number, number] {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
          break;
        case g:
          h = ((b - r) / d + 2) * 60;
          break;
        case b:
          h = ((r - g) / d + 4) * 60;
          break;
      }
    }

    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }

  function handleHueChange(value: number) {
    hue = value;
    hexValue = hslToHex(hue, saturation, lightness);
  }

  function handleSaturationChange(value: number) {
    saturation = value;
    hexValue = hslToHex(hue, saturation, lightness);
  }

  function handleLightnessChange(value: number) {
    lightness = value;
    hexValue = hslToHex(hue, saturation, lightness);
  }

  function handleHexChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      hexValue = value;
      const [h, s, l] = hexToHsl(value);
      hue = h;
      saturation = s;
      lightness = l;
    }
  }

  function handleConfirm() {
    onselect?.(hexValue);
    open = false;
  }

  function handleCancel() {
    hexValue = color;
    const [h, s, l] = hexToHsl(color);
    hue = h;
    saturation = s;
    lightness = l;
    open = false;
    onclose?.();
  }

  const previewColor = $derived(hexValue);
</script>

<Modal
  bind:open={open}
  modalHeading={m.color_picker_title()}
  size="xs"
  primaryButtonText={m.confirm()}
  secondaryButtonText={m.cancel()}
  on:click:button--primary={handleConfirm}
  on:click:button--secondary={handleCancel}
  on:close={handleCancel}
>
  <div class="color-picker">
    <div class="preview-row">
      <div class="color-preview" style="--preview-color: {previewColor}"></div>
      <TextInput
        id="hex-input"
        labelText={m.hex_color()}
        value={hexValue}
        on:input={handleHexChange}
        placeholder="#ffffff"
      />
    </div>

    <div class="slider-group">
      <div class="slider-row">
        <span class="slider-label">{m.hue()}</span>
        <div class="slider-wrapper hue-slider">
          <Slider
            min={0}
            max={360}
            step={1}
            value={hue}
            hideTextInput
            on:change={(e) => handleHueChange(e.detail)}
          />
        </div>
        <span class="slider-value">{hue}°</span>
      </div>

      <div class="slider-row">
        <span class="slider-label">{m.saturation()}</span>
        <div class="slider-wrapper">
          <Slider
            min={0}
            max={100}
            step={1}
            value={saturation}
            hideTextInput
            on:change={(e) => handleSaturationChange(e.detail)}
          />
        </div>
        <span class="slider-value">{saturation}%</span>
      </div>

      <div class="slider-row">
        <span class="slider-label">{m.lightness()}</span>
        <div class="slider-wrapper">
          <Slider
            min={0}
            max={100}
            step={1}
            value={lightness}
            hideTextInput
            on:change={(e) => handleLightnessChange(e.detail)}
          />
        </div>
        <span class="slider-value">{lightness}%</span>
      </div>
    </div>
  </div>
</Modal>

<style lang="scss">
  .color-picker {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
    padding: var(--cds-spacing-03) 0;
  }

  .preview-row {
    display: flex;
    align-items: flex-end;
    gap: var(--cds-spacing-04);
  }

  .color-preview {
    width: 64px;
    height: 64px;
    border-radius: 4px;
    background-color: var(--preview-color);
    border: 1px solid var(--cds-border-subtle);
    flex-shrink: 0;
  }

  .slider-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .slider-row {
    display: grid;
    grid-template-columns: 80px 1fr 50px;
    gap: var(--cds-spacing-03);
    align-items: center;
  }

  .slider-label {
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }

  .slider-wrapper {
    width: 100%;
  }

  .slider-value {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    text-align: right;
  }

  .hue-slider :global(.bx--slider__track) {
    background: linear-gradient(
      to right,
      #ff0000,
      #ffff00,
      #00ff00,
      #00ffff,
      #0000ff,
      #ff00ff,
      #ff0000
    );
  }
</style>
