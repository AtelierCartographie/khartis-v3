<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import { hslToHex } from '$lib/features/commons/utils/color-utils';
  import { m } from '$lib/paraglide/messages';
  import {
    DEFAULT_PAGE_COLOR,
    formatActions,
    getFormatState
  } from './format.store.svelte';

  const formatState = $derived(getFormatState());

  const color = $derived(
    typeof formatState.color === 'object' && formatState.color
      ? formatState.color
      : DEFAULT_PAGE_COLOR
  );
  const colorHex = $derived(
    hslToHex(color.hue, color.saturation, color.lightness)
  );
</script>

<ColorPicker
  triggerLabel={m.format_color()}
  hex={colorHex}
  hue={color.hue}
  saturation={color.saturation}
  lightness={color.lightness}
  onCancel={() => {}}
  onValidate={(payload: {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  }) => {
    formatActions.setColor({
      hue: payload.hue,
      saturation: payload.saturation,
      lightness: payload.lightness
    });
  }}
/>
