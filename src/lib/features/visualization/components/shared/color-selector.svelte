<script lang="ts">
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';

  interface Props {
    label?: string;
    value: string;
    size?: 'default' | 'small';
    exclusive?: boolean;
    onchange?: (color: string) => void;
  }

  // size prop kept for API compatibility, no visual distinction in ColorPicker
  let {
    label = '',
    value,
    size: _size = 'default',
    exclusive = false,
    onchange
  }: Props = $props();
</script>

<SingleColorPreview
  label={label}
  color={value}
  exclusive={exclusive}
  onchange={onchange}
/>
