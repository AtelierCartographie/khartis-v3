<script lang="ts">
  import { factoryResetPwa } from '$lib/features/commons/utils/pwa-reset';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    ComposedModal,
    Loading,
    ModalBody,
    ModalHeader
  } from 'carbon-components-svelte';
  import { Renew } from 'carbon-icons-svelte';

  let isOpen = $state(false);
  let isBusy = $state(false);

  function openModal() {
    isOpen = true;
  }

  function closeModal() {
    if (isBusy) return;
    isOpen = false;
  }

  async function handleConfirm() {
    if (isBusy) return;
    isBusy = true;
    try {
      await factoryResetPwa({ reload: true });
    } catch (error) {
      logger.error('PWA update reset failed', LogCategory.SYSTEM, error);
      isBusy = false;
      isOpen = false;
    }
  }
</script>

<Button
  size="small"
  kind="ghost"
  icon={Renew}
  class="menu-bar-item"
  data-testid="sidenav-clear-cache-button"
  on:click={openModal}
>
  {m.sidenav_clear_cache_button()}
</Button>

<ComposedModal
  bind:open={isOpen}
  size="sm"
  preventCloseOnClickOutside={isBusy}
  on:close={closeModal}
>
  <ModalHeader title={m.sidenav_clear_cache_confirm_title()} />
  <ModalBody class="update-modal-body">
    <p>{m.sidenav_clear_cache_confirm_body()}</p>
  </ModalBody>
  <div class="update-modal-footer">
    <Button kind="secondary" disabled={isBusy} on:click={closeModal}>
      {m.sidenav_clear_cache_confirm_secondary()}
    </Button>
    <Button kind="primary" disabled={isBusy} on:click={handleConfirm}>
      {#if isBusy}
        <span class="update-button-loading">
          <Loading small withOverlay={false} />
          <span>{m.sidenav_clear_cache_in_progress()}</span>
        </span>
      {:else}
        {m.sidenav_clear_cache_confirm_primary()}
      {/if}
    </Button>
  </div>
</ComposedModal>

<style>
  :global(.update-modal-body) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  :global(.update-modal-body p) {
    margin: 0;
    color: var(--cds-text-02);
    line-height: 1.5;
  }

  .update-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04) var(--cds-spacing-05);
    border-top: 1px solid var(--cds-border-subtle);
  }

  .update-button-loading {
    display: inline-flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .update-button-loading :global(.bx--loading) {
    width: 1rem;
    height: 1rem;
  }
</style>
