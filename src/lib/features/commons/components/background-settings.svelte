<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import SliderWithInput from '$lib/features/commons/components/slider-with-input.svelte';
  import Switch from '$lib/features/commons/components/switch.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import * as m from '$lib/paraglide/messages';

  type HslColor = { hue: number; saturation: number; lightness: number };

  interface Props {
    enabled: boolean;
    color: HslColor;
    opacity: number;
    shadow: boolean;
    onEnabledChange: (enabled: boolean) => void;
    onColorChange: (color: HslColor) => void;
    onOpacityChange: (opacity: number) => void;
    onShadowChange: (shadow: boolean) => void;
  }

  const {
    enabled,
    color,
    opacity,
    shadow,
    onEnabledChange,
    onColorChange,
    onOpacityChange,
    onShadowChange
  }: Props = $props();

  const hex = $derived(hslToHex(color.hue, color.saturation, color.lightness));
</script>

<div class="background-settings">
  <div class="background-row">
    <div class="background-toggle">
      <span class="field-label">{m.legend_background()}</span>
      <Switch
        labelText={m.legend_background()}
        hideLabel
        size="sm"
        toggled={enabled}
        labelA={m.no()}
        labelB={m.yes()}
        showStateLabel
        onchange={onEnabledChange}
      />
    </div>

    <ColorPicker
      triggerLabel={m.legend_background_color()}
      hex={hex}
      hue={color.hue}
      saturation={color.saturation}
      lightness={color.lightness}
      disabled={!enabled}
      onValidate={({ hue, saturation, lightness }: HslColor) =>
        onColorChange({ hue, saturation, lightness })}
    />
  </div>

  <!-- Exports draw the shadow under the background, so it needs one. -->
  <div class="background-toggle inline">
    <span class="field-label">{m.background_drop_shadow()}</span>
    <Switch
      labelText={m.background_drop_shadow()}
      hideLabel
      size="sm"
      toggled={shadow}
      disabled={!enabled}
      labelA={m.no()}
      labelB={m.yes()}
      showStateLabel
      onchange={onShadowChange}
    />
  </div>

  <SliderWithInput
    label={m.legend_opacity()}
    value={opacity}
    disabled={!enabled}
    min={0}
    max={100}
    step={1}
    inputWidth="72px"
    showSteppers={false}
    onchange={onOpacityChange}
  />
</div>

<style>
  .background-settings {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .background-row {
    display: grid;
    grid-template-columns: minmax(6rem, auto) minmax(0, 1fr);
    gap: var(--cds-spacing-05);
    align-items: end;
  }

  @media (max-width: 480px) {
    .background-row {
      grid-template-columns: 1fr;
      gap: var(--cds-spacing-03);
    }
  }

  .background-toggle {
    display: flex;
    flex-direction: column;
    gap: var(--kh-gap-label);
  }

  .background-toggle.inline {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-05);
  }

  .field-label {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-secondary, #525252);
  }

  .background-toggle :global(.kh-switch-native) {
    gap: var(--cds-spacing-03);
    min-height: var(--kh-size-sm);
  }
</style>
