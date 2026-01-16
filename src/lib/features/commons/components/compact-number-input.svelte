<script lang="ts">
  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    width?: string;
    disabled?: boolean;
    onchange?: (value: number) => void;
  }

  let {
    value = $bindable(),
    min = 0,
    max = 100,
    step = 1,
    width = '64px',
    disabled = false,
    onchange
  }: Props = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    let newValue = parseFloat(target.value);

    if (isNaN(newValue)) return;

    if (newValue < min) newValue = min;
    if (newValue > max) newValue = max;

    value = newValue;
    onchange?.(newValue);
  }

  function handleBlur(e: Event) {
    const target = e.target as HTMLInputElement;
    target.value = String(value);
  }
</script>

<div class="compact-number-input" style="--input-width: {width}">
  <input
    type="number"
    min={min}
    max={max}
    step={step}
    value={value}
    disabled={disabled}
    oninput={handleInput}
    onblur={handleBlur}
  />
</div>

<style lang="scss">
  .compact-number-input {
    width: var(--input-width);
    min-width: var(--input-width);
    max-width: var(--input-width);
    flex-shrink: 0;

    input {
      width: 100%;
      height: 32px;
      padding: 0 var(--cds-spacing-03);
      border: none;
      border-bottom: 1px solid var(--cds-border-strong-01, #8d8d8d);
      background-color: var(--cds-field-01, #f4f4f4);
      color: var(--cds-text-primary, #161616);
      font-size: 0.875rem;
      text-align: center;
      outline: none;
      box-sizing: border-box;

      appearance: textfield;
      -moz-appearance: textfield;

      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      &:focus {
        border-bottom: 2px solid var(--cds-focus, #0f62fe);
      }

      &:disabled {
        color: var(--cds-text-disabled, #c6c6c6);
        cursor: not-allowed;
      }
    }
  }
</style>
