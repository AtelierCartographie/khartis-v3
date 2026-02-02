<script lang="ts">
  import { Toggle } from 'carbon-components-svelte';
  import { Information } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    label: string;
    toggled: boolean;
    showYesNo?: boolean;
    showInfo?: boolean;
    infoLabel?: string;
    ontoggle?: (value: boolean) => void;
  }

  let {
    label,
    toggled = $bindable(),
    showYesNo = true,
    showInfo = false,
    infoLabel = '',
    ontoggle
  }: Props = $props();

  function handleToggle() {
    toggled = !toggled;
    ontoggle?.(toggled);
  }
</script>

<div class="toggle-row">
  <span class="field-label">{label}</span>
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
    {#if showInfo}
      <button
        type="button"
        class="info-btn"
        aria-label={infoLabel || m.more_info()}
      >
        <Information size={16} />
      </button>
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

  .info-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--cds-text-02);

    &:hover {
      color: var(--cds-text-primary);
    }
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
