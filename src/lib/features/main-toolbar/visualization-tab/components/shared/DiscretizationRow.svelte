<script lang="ts">
  import { Settings } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    label: string;
    value: string;
    onsettings?: () => void;
  }

  let { label, value, onsettings }: Props = $props();
</script>

<div class="discretization-row">
  <span class="field-label">{label}</span>
  <div class="discretization-value">
    <span>{value}</span>
    <button
      type="button"
      class="settings-btn"
      aria-label={m.more_info()}
      onclick={() => onsettings?.()}
    >
      <Settings size={16} />
    </button>
  </div>
</div>

<style lang="scss">
  .discretization-row {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-03) 0;
    border-bottom: 1px solid var(--cds-border-subtle);
    gap: var(--cds-spacing-02);
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-weight: 400;
  }

  .discretization-value {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);

    span {
      font-size: 0.875rem;
      color: var(--cds-text-primary);
    }
  }

  .settings-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--cds-spacing-02);
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--cds-icon-01);

    &:hover {
      background: var(--cds-hover-ui);
    }
  }
</style>
