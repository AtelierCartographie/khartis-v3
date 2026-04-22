<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { Settings } from 'carbon-icons-svelte';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    label: string;
    value: string;
    settingsIconDescription?: string;
    onsettings?: (event: MouseEvent) => void;
  }

  let {
    label,
    value,
    settingsIconDescription = m.discretization_settings(),
    onsettings
  }: Props = $props();
</script>

<div class="discretization-row">
  <span class="field-label">{label}</span>
  <div class="discretization-value">
    <span>{value}</span>
    <IconButton
      kind="ghost"
      size="small"
      icon={Settings}
      iconDescription={settingsIconDescription}
      on:click={(event) => onsettings?.(event)}
    />
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
</style>
