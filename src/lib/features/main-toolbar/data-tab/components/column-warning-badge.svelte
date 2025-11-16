<script lang="ts">
  import { Tooltip } from 'carbon-components-svelte';
  import { WarningAlt, WarningAltFilled } from 'carbon-icons-svelte';
  import { m } from '$lib/paraglide/messages';

  interface ColumnWarningBadgeProps {
    type: 'null' | 'duplicate';
    count: number;
    columnName?: string;
  }

  let { type, count, columnName = '' }: ColumnWarningBadgeProps = $props();

  const warningText = $derived(
    type === 'null'
      ? m.column_warning_nulls({ count: count.toString() })
      : m.column_warning_duplicates({ count: count.toString() })
  );

  const tooltipText = $derived(
    type === 'null'
      ? `${count} valeurs manquantes détectées dans la colonne ${columnName ? `"${columnName}"` : ''}`
      : `${count} valeurs en double détectées dans la colonne ${columnName ? `"${columnName}"` : ''}`
  );

  const warningIcon = $derived(count > 5 ? WarningAltFilled : WarningAlt);
</script>

<div class="column-warning-badge">
  <Tooltip align="start" hideIcon>
    <div slot="triggerText" class="warning-content">
      {@const Icon = warningIcon}
      <Icon size={16} />
      <span class="warning-text">{warningText}</span>
    </div>
    <p>{tooltipText}</p>
  </Tooltip>
</div>

<style>
  .column-warning-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    background-color: var(--cds-notification-background-error);
    border: 1px solid var(--cds-support-error);
    border-radius: 4px;
    margin: 2px 0;
    font-size: 0.6875rem;
    line-height: 1;
  }

  .warning-content {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--cds-support-error);
    cursor: help;
  }

  .warning-text {
    font-weight: 500;
    white-space: nowrap;
  }

  .column-warning-badge :global(svg) {
    flex-shrink: 0;
    fill: var(--cds-support-error);
  }

  /* Hover state */
  .column-warning-badge:hover {
    background-color: var(--cds-notification-background-error);
    opacity: 0.9;
  }
</style>
