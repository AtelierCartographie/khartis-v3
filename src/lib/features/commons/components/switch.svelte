<script lang="ts">
  interface Props {
    toggled?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
    variant?: 'default' | 'suggestions';
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
    variant = 'default',
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
  class:variant-suggestions={variant === 'suggestions'}
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
    <span class="kh-switch-state" aria-hidden="true">
      {toggled ? labelB : labelA}
    </span>
  {/if}
</label>

<style lang="scss">
  .kh-switch-native {
    --_kh-switch-width: 36px;
    --_kh-switch-height: 20px;
    --_kh-switch-knob-size: 14px;
    --_kh-switch-knob-offset: 3px;
    --_kh-switch-knob-translate: 16px;
    --_kh-switch-track-off: var(--cds-ui-04, #8d8d8d);
    --_kh-switch-track-on: var(--cds-blue, #0072c3);
    --_kh-switch-knob-bg: var(--cds-icon-03, #ffffff);
    --_kh-switch-label-size: 0.875rem;
    --_kh-switch-label-line-height: 1.125rem;
    --_kh-switch-label-letter-spacing: normal;
    --_kh-switch-label-color: var(--cds-text-primary);
    --_kh-switch-state-size: 0.75rem;
    --_kh-switch-state-line-height: 1rem;
    --_kh-switch-state-letter-spacing: normal;
    --_kh-switch-state-color: var(--cds-text-secondary);
    --_kh-switch-focus-ring: 0 0 0 2px var(--cds-focus, #0f62fe);
    --_kh-switch-disabled-opacity: 0.5;
    --_kh-switch-disabled-track: var(--_kh-switch-track-off);
    --_kh-switch-disabled-knob: var(--_kh-switch-knob-bg);
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    cursor: pointer;
  }

  .kh-switch-native.disabled {
    cursor: not-allowed;
  }

  .kh-switch-native.sm {
    --_kh-switch-width: 32px;
    --_kh-switch-height: 16px;
    --_kh-switch-knob-size: 10px;
    --_kh-switch-knob-translate: 16px;
  }

  .kh-switch-native.variant-suggestions {
    --_kh-switch-width: 40px;
    --_kh-switch-height: 22px;
    --_kh-switch-knob-size: 16px;
    --_kh-switch-knob-translate: 18px;
    --_kh-switch-track-off: var(
      --khartis-additions-border-tile-01-suggestions,
      #82cfff
    );
    --_kh-switch-track-on: var(--cds-blue, #0072c3);
    --_kh-switch-knob-bg: var(--cds-icon-on-color, #ffffff);
    --_kh-switch-label-size: 0.75rem;
    --_kh-switch-label-line-height: 1rem;
    --_kh-switch-label-letter-spacing: 0.32px;
    --_kh-switch-label-color: var(
      --khartis-additions-text-secondary-suggestions,
      #00539a
    );
    --_kh-switch-state-size: 0.875rem;
    --_kh-switch-state-line-height: 1.125rem;
    --_kh-switch-state-letter-spacing: 0.16px;
    --_kh-switch-state-color: var(
      --khartis-additions-text-primary-suggestions,
      #003a6d
    );
    --_kh-switch-focus-ring: 0 0 0 2px var(--cds-interactive-03, #726e6e);
    --_kh-switch-disabled-opacity: 1;
    --_kh-switch-disabled-track: var(--cds-button-disabled, #c6c6c6);
    --_kh-switch-disabled-knob: var(--cds-text-on-color-disabled, #8d8d8d);
  }

  .kh-switch-native.variant-suggestions.sm {
    --_kh-switch-width: 32px;
    --_kh-switch-height: 16px;
    --_kh-switch-knob-size: 10px;
    --_kh-switch-knob-translate: 16px;
  }

  .kh-switch-input {
    appearance: none;
    position: relative;
    width: var(--_kh-switch-width);
    height: var(--_kh-switch-height);
    border: none;
    border-radius: 9999px;
    background-color: var(--_kh-switch-track-off);
    cursor: pointer;
    transition:
      background-color 0.12s ease,
      box-shadow 0.12s ease;
    flex-shrink: 0;
  }

  .kh-switch-input::before {
    content: '';
    position: absolute;
    top: var(--_kh-switch-knob-offset);
    left: var(--_kh-switch-knob-offset);
    width: var(--_kh-switch-knob-size);
    height: var(--_kh-switch-knob-size);
    border-radius: 50%;
    background-color: var(--_kh-switch-knob-bg);
    transition: transform 0.12s ease;
  }

  .kh-switch-input:checked {
    background-color: var(--_kh-switch-track-on);
  }

  .kh-switch-input:checked::before {
    transform: translateX(var(--_kh-switch-knob-translate));
  }

  .kh-switch-input:disabled {
    opacity: var(--_kh-switch-disabled-opacity);
    background-color: var(--_kh-switch-disabled-track);
    cursor: not-allowed;
  }

  .kh-switch-input:disabled::before {
    background-color: var(--_kh-switch-disabled-knob);
  }

  .kh-switch-input:focus-visible {
    outline: none;
    box-shadow: var(--_kh-switch-focus-ring);
  }

  .kh-switch-label {
    font-size: var(--_kh-switch-label-size);
    line-height: var(--_kh-switch-label-line-height);
    letter-spacing: var(--_kh-switch-label-letter-spacing);
    color: var(--_kh-switch-label-color);
  }

  .kh-switch-state {
    font-size: var(--_kh-switch-state-size);
    line-height: var(--_kh-switch-state-line-height);
    letter-spacing: var(--_kh-switch-state-letter-spacing);
    color: var(--_kh-switch-state-color);
    min-width: 2rem;
  }
</style>
