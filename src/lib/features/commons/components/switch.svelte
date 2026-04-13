<script lang="ts">
  interface Props {
    toggled?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
    labelText?: string;
    hideLabel?: boolean;
    labelA?: string;
    labelB?: string;
    showStateLabel?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let {
    toggled = $bindable(false),
    disabled = false,
    size = 'sm',
    labelText = '',
    hideLabel = false,
    labelA = '',
    labelB = '',
    showStateLabel = false,
    onchange
  }: Props = $props();

  function stopBubbleEvents(node: HTMLElement) {
    const events = [
      'click',
      'mousedown',
      'mouseup',
      'pointerdown',
      'pointerup',
      'keydown',
      'keyup'
    ] as const;
    const handler = (event: Event) => event.stopPropagation();

    events.forEach((eventName) => {
      node.addEventListener(eventName, handler, { capture: true });
    });

    return {
      destroy() {
        events.forEach((eventName) => {
          node.removeEventListener(eventName, handler, { capture: true });
        });
      }
    };
  }

  function handleChange(event: Event): void {
    const next = (event.currentTarget as HTMLInputElement).checked;
    toggled = next;
    onchange?.(next);
  }
</script>

<label
  class="kh-switch-native"
  class:disabled={disabled}
  class:sm={size === 'sm'}
  use:stopBubbleEvents
>
  {#if !hideLabel && labelText}
    <span class="kh-switch-label">{labelText}</span>
  {/if}

  <input
    type="checkbox"
    role="switch"
    class="kh-switch-input"
    checked={toggled}
    disabled={disabled}
    aria-label={hideLabel ? labelText : undefined}
    onchange={handleChange}
  />

  {#if showStateLabel}
    <span class="kh-switch-state">{toggled ? labelB : labelA}</span>
  {/if}
</label>

<style lang="scss">
  .kh-switch-native {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    cursor: pointer;
  }

  .kh-switch-native.disabled {
    cursor: not-allowed;
  }

  .kh-switch-input {
    appearance: none;
    position: relative;
    width: 40px;
    height: 22px;
    border: none;
    border-radius: 9999px;
    background-color: var(--cds-ui-04, #8d8d8d);
    cursor: pointer;
    transition: background-color 0.12s ease;
    flex-shrink: 0;
  }

  .kh-switch-input::before {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: var(--cds-icon-03, #ffffff);
    transition: transform 0.12s ease;
  }

  .kh-switch-native.sm .kh-switch-input {
    width: 36px;
    height: 20px;
  }

  .kh-switch-native.sm .kh-switch-input::before {
    width: 14px;
    height: 14px;
  }

  .kh-switch-input:checked {
    background-color: var(--cds-support-02, #198038);
  }

  .kh-switch-input:checked::before {
    transform: translateX(18px);
  }

  .kh-switch-native.sm .kh-switch-input:checked::before {
    transform: translateX(16px);
  }

  .kh-switch-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .kh-switch-input:focus-visible {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: 2px;
  }

  .kh-switch-label {
    font-size: 0.875rem;
    line-height: 1.125rem;
    color: var(--cds-text-primary);
  }

  .kh-switch-state {
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--cds-text-secondary);
    min-width: 2rem;
  }
</style>
