<script lang="ts">
  import type { Component } from 'svelte';
  interface Props {
    icon: Component<{ class?: string }>;
    iconDescription?: string;
    kind?:
      | 'primary'
      | 'secondary'
      | 'tertiary'
      | 'ghost'
      | 'danger'
      | 'danger-ghost'
      | 'danger-tertiary';
    size?: 'default' | 'field' | 'small' | 'lg' | 'xl';
    disabled?: boolean;
    class?: string;
    onclick?: (event: MouseEvent) => void;
  }

  let {
    icon: IconComponent,
    iconDescription = '',
    kind = 'primary',
    size = 'default',
    disabled = false,
    class: className = '',
    onclick
  }: Props = $props();

  const kindClass = $derived(`bx--btn--${kind}`);
  const sizeClass = $derived(
    size === 'small'
      ? 'bx--btn--sm'
      : size === 'default'
        ? ''
        : `bx--btn--${size}`
  );
</script>

<button
  type="button"
  class="bx--btn {kindClass} {sizeClass} bx--btn--icon-only {className}"
  disabled={disabled}
  aria-label={iconDescription}
  title={iconDescription}
  onclick={onclick}
>
  <IconComponent class="bx--btn__icon" />
</button>
