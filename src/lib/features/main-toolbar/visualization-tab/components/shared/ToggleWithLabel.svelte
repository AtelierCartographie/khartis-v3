<script lang="ts">
  import { Toggle } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';
  import InfoPopover from './InfoPopover.svelte';

  interface Props {
    label: string;
    toggled: boolean;
    showYesNo?: boolean;
    infoText?: string;
    ontoggle?: (value: boolean) => void;
  }

  let {
    label,
    toggled = $bindable(),
    showYesNo = true,
    infoText,
    ontoggle
  }: Props = $props();

  function handleToggle() {
    toggled = !toggled;
    ontoggle?.(toggled);
  }
</script>

<div class="toggle-row">
  <span class="field-label">
    {label}
    {#if infoText}
      <InfoPopover text={infoText} />
    {/if}
  </span>
  <div class="toggle-with-label">
    <Toggle
      size="sm"
      toggled={toggled}
      hideLabel
      labelA=""
      labelB=""
      on:toggle={handleToggle}
    />
    {#if showYesNo}
      <span class="toggle-label">{toggled ? m.yes() : m.no()}</span>
    {/if}
  </div>
</div>

<style lang="scss">
  .toggle-row {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-02) 0;
    gap: var(--cds-spacing-04);
  }

  .field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-02);
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
    font-weight: 400;
  }

  .toggle-with-label {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .toggle-label {
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    min-width: 30px;
  }

  :global(.toggle-row .bx--toggle) {
    margin: 0;
  }

  :global(.toggle-row .bx--toggle__switch) {
    width: 36px;
    height: 20px;
  }

  :global(.toggle-row .bx--toggle__switch::before) {
    width: 14px;
    height: 14px;
  }

  :global(.toggle-row .bx--toggle-input:checked + .bx--toggle__switch::before) {
    transform: translateX(16px);
  }
</style>
