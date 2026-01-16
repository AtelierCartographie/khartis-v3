<script lang="ts">
  import { Toggle } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    label: string;
    toggled: boolean;
    showYesNo?: boolean;
    ontoggle?: (value: boolean) => void;
  }

  let {
    label,
    toggled = $bindable(),
    showYesNo = true,
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
  </div>
</div>

<style lang="scss">
  .toggle-row {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-02) 0;
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
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
</style>
