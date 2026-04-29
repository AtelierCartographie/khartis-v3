<script lang="ts">
  import type { Snippet, Component } from 'svelte';

  interface Props {
    children?: Snippet;
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
    type?: 'button' | 'submit' | 'reset';
    icon?: Component<{ class?: string }>;
    iconDescription?: string;
    class?: string;
    onclick?: (event: MouseEvent) => void;
  }

  let {
    children,
    kind = 'primary',
    size = 'default',
    disabled = false,
    type = 'button',
    icon: IconComponent,
    iconDescription = '',
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
  const iconOnlyClass = $derived(
    !children && IconComponent ? 'bx--btn--icon-only' : ''
  );
</script>

<button
  type={type}
  class="bx--btn {kindClass} {sizeClass} {iconOnlyClass} {className}"
  disabled={disabled}
  aria-label={iconDescription}
  onclick={onclick}
>
  {#if children}{@render children()}{/if}
  {#if IconComponent}
    <IconComponent class="bx--btn__icon" />
  {/if}
</button>
