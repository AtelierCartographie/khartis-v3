<script lang="ts">
  import { TextInput } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import { InfoPopover } from '../../shared';

  interface Props {
    label: string;
    value: number | null;
    placeholder?: string;
    infoText?: string;
    onchange: (value: number | null) => void;
  }

  let {
    label,
    value,
    placeholder = m.break_value_placeholder(),
    infoText,
    onchange
  }: Props = $props();

  function handleInput(event: Event) {
    const detail = (event as CustomEvent).detail as number | null;
    onchange(
      typeof detail === 'number' && Number.isFinite(detail) ? detail : null
    );
  }
</script>

<div class="field-group">
  <span class="field-label">
    {label}
    {#if infoText}
      <InfoPopover text={infoText} />
    {/if}
  </span>
  <TextInput
    labelText=""
    hideLabel
    type="number"
    placeholder={placeholder}
    value={value === null ? '' : String(value)}
    on:input={handleInput}
  />
</div>

<style lang="scss">
  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }
</style>
