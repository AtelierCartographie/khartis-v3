<script lang="ts">
  import ColorPicker from '$lib/features/commons/components/color-picker.svelte';
  import { hexToHsl } from '$lib/features/commons/utils/color-utils';

  interface Props {
    label?: string;
    value: string;
    size?: 'default' | 'small';
    exclusive?: boolean;
    onchange?: (color: string) => void;
  }

  let {
    label = '',
    value,
    size: _size = 'default',
    exclusive = false,
    onchange
  }: Props = $props();

  const hsl = $derived(hexToHsl(value));
</script>

<ColorPicker
  exclusive={exclusive}
  triggerLabel={label}
  hex={value}
  hue={hsl.hue}
  saturation={hsl.saturation}
  lightness={hsl.lightness}
  onValidate={({
    hex
  }: {
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
  }) => onchange?.(hex)}
/>
