<script lang="ts" generics="T extends string | number">
  import SimpleRadio from './simple-radio.svelte';

  interface SimpleRadioOption {
    value: T;
    labelText: string;
    disabled?: boolean;
  }

  interface Props {
    items: ReadonlyArray<SimpleRadioOption>;
    selected: T | undefined | null;
    name: string;
    legendText?: string;
    hideLegend?: boolean;
    orientation?: 'horizontal' | 'vertical';
    size?: 'sm' | 'md';
    variant?: 'default' | 'suggestions';
    disabled?: boolean;
    onchange?: (value: T) => void;
  }

  let {
    items,
    selected,
    name,
    legendText = '',
    hideLegend = false,
    orientation = 'horizontal',
    size = 'sm',
    variant = 'default',
    disabled = false,
    onchange
  }: Props = $props();

  function handleSelect(value: T, isChecked: boolean): void {
    if (!isChecked || value === selected) return;
    onchange?.(value);
  }
</script>

<fieldset
  class="kh-radio-group"
  class:vertical={orientation === 'vertical'}
  class:disabled={disabled}
  disabled={disabled}
>
  {#if legendText}
    <legend class="kh-radio-group-legend" class:visually-hidden={hideLegend}>
      {legendText}
    </legend>
  {/if}
  <div class="kh-radio-group-items">
    {#each items as item (item.value)}
      <SimpleRadio
        name={name}
        value={String(item.value)}
        checked={selected === item.value}
        labelText={item.labelText}
        disabled={disabled || item.disabled}
        size={size}
        variant={variant}
        onchange={(checked) => handleSelect(item.value, checked)}
      />
    {/each}
  </div>
</fieldset>

<style lang="scss">
  .kh-radio-group {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .kh-radio-group-legend {
    padding: 0;
    margin-bottom: var(--cds-spacing-03);
    color: var(--cds-text-secondary, #525252);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }

  .kh-radio-group-legend.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .kh-radio-group-items {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--cds-spacing-05);
  }

  .kh-radio-group.vertical .kh-radio-group-items {
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .kh-radio-group.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
</style>
