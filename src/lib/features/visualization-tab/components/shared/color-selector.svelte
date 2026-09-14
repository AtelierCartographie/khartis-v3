<script lang="ts">
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';

  interface Props {
    label?: string;
    value: string;
    presets?: readonly string[];
    exclusive?: boolean;
    onchange?: (color: string) => void;
  }

  let {
    label = '',
    value,
    presets,
    exclusive = false,
    onchange
  }: Props = $props();
</script>

<SingleColorPreview
  label={label}
  color={value}
  presets={presets}
  exclusive={exclusive}
  onchange={onchange}
/>
