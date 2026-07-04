<script lang="ts">
  import SingleColorPreview from '$lib/features/commons/components/palette-popover/single-color-preview.svelte';

  interface Props {
    label?: string;
    value: string;
    exclusive?: boolean;
    onchange?: (color: string) => void;
  }

  let { label = '', value, exclusive = false, onchange }: Props = $props();
</script>

<SingleColorPreview
  label={label}
  color={value}
  exclusive={exclusive}
  onchange={onchange}
/>
