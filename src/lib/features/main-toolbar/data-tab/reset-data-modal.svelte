<script lang="ts">
  import { Modal } from 'carbon-components-svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import {
    showSuccess,
    showError
  } from '$lib/features/commons/utils/notification.utils.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import * as m from '$lib/paraglide/messages';

  let {
    open = $bindable(false),
    datasetId,
    onSuccess
  }: {
    open: boolean;
    datasetId: string;
    onSuccess?: () => void;
  } = $props();

  let isResetting = $state(false);

  const dataset = $derived(
    datasetsStore.datasets.find((d) => d.id === datasetId)
  );
  const hasModifications = $derived(
    dataset ? datasetsStore.hasModifications(datasetId) : false
  );

  async function handleReset() {
    isResetting = true;
    try {
      const success = await datasetsStore.resetDataset(datasetId);

      if (success) {
        showSuccess(
          m.reset_data_success_title(),
          m.reset_data_success_message()
        );
        onSuccess?.();
        open = false;
      } else {
        showError(m.reset_data_error_title(), m.reset_data_error_message());
      }
    } catch (error) {
      logger.error('Failed to reset dataset', LogCategory.DATA, error);
      showError(m.reset_data_error_title(), m.reset_data_error_generic());
    } finally {
      isResetting = false;
    }
  }
</script>

<Modal
  bind:open={open}
  modalHeading={m.reset_data_modal_title()}
  primaryButtonText={isResetting
    ? m.reset_data_modal_resetting()
    : m.reset_data_modal_button()}
  primaryButtonDisabled={isResetting || !hasModifications || !dataset}
  secondaryButtonText={m.cancel()}
  danger
  on:click:button--secondary={() => (open = false)}
  on:submit={handleReset}
  size="sm"
>
  <p>
    {m.reset_data_modal_description({ name: dataset?.name || '' })}
  </p>

  {#if hasModifications}
    <p
      style="margin-top: 1rem; color: var(--cds-text-error); font-weight: 600;"
    >
      {m.reset_data_modal_warning()}
    </p>
    <p style="margin-top: 0.5rem; color: var(--cds-text-02);">
      {m.reset_data_modal_irreversible()}
    </p>
  {:else}
    <p style="margin-top: 1rem; color: var(--cds-text-02);">
      {m.reset_data_modal_no_modifications()}
    </p>
  {/if}
</Modal>
