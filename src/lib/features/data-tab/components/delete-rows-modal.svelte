<script lang="ts">
  import { InlineNotification, Modal } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';

  let {
    open = $bindable(false),
    rowCount,
    affectedVisualizationCount = 0,
    onConfirm,
    onCancel
  }: {
    open: boolean;
    rowCount: number;
    affectedVisualizationCount?: number;
    onConfirm: () => Promise<void>;
    onCancel?: () => void;
  } = $props();

  let isDeleting = $state(false);

  async function handleConfirm() {
    if (isDeleting) return;
    isDeleting = true;
    try {
      await onConfirm();
      open = false;
    } finally {
      isDeleting = false;
    }
  }

  function handleCancel() {
    open = false;
    onCancel?.();
  }
</script>

<Modal
  bind:open={open}
  modalHeading={m.delete_rows_modal_title()}
  primaryButtonText={isDeleting ? m.deleting() : m.delete_confirm_button()}
  primaryButtonDisabled={isDeleting}
  secondaryButtonText={m.cancel()}
  danger
  on:click:button--secondary={handleCancel}
  on:click:button--primary={handleConfirm}
  on:submit={handleConfirm}
  size="sm"
>
  <p>
    {m.delete_rows_confirm_message({ count: rowCount })}
  </p>
  {#if affectedVisualizationCount > 0}
    <InlineNotification
      kind="warning"
      lowContrast
      hideCloseButton
      title={m.delete_rows_visualization_warning({
        count: affectedVisualizationCount
      })}
    />
  {/if}
  <p style="margin-top: 1rem; color: var(--cds-text-error);">
    {m.delete_rows_warning()}
  </p>
</Modal>
