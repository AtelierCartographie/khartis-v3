<script lang="ts">
  import { factoryResetPwa } from '$lib/features/commons/utils/pwa-offline';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Button,
    ComposedModal,
    InlineNotification,
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
      logger.error('PWA repair failed', LogCategory.SYSTEM, error);
      isBusy = false;
      isOpen = false;
    }
  }
</script>

<Button
  size="small"
  kind="ghost"
  icon={Renew}
  class="menu-bar-item app-action-button"
  data-testid="sidenav-clear-cache-button"
  on:click={openModal}
  aria-label={`${m.sidenav_clear_cache_button()}: ${m.sidenav_clear_cache_hint()}`}
>
  <span class="app-action-copy">
    <span class="app-action-title">{m.sidenav_clear_cache_button()}</span>
    <span class="app-action-meta">{m.sidenav_clear_cache_hint()}</span>
  </span>
</Button>

<ComposedModal
  bind:open={isOpen}
  size="sm"
  preventCloseOnClickOutside={isBusy}
  on:close={closeModal}
>
  <ModalHeader title={m.sidenav_clear_cache_confirm_title()} />
  <ModalBody class="repair-modal-body">
    <p>{m.sidenav_clear_cache_confirm_body()}</p>
    <InlineNotification
      kind="warning"
      lowContrast
      hideCloseButton
      title={m.sidenav_clear_cache_confirm_warning()}
    />
  </ModalBody>
  <div class="repair-modal-footer">
    <Button kind="secondary" disabled={isBusy} on:click={closeModal}>
      {m.sidenav_clear_cache_confirm_secondary()}
    </Button>
    <Button kind="danger" disabled={isBusy} on:click={handleConfirm}>
      {isBusy
        ? m.sidenav_clear_cache_in_progress()
        : m.sidenav_clear_cache_confirm_primary()}
    </Button>
  </div>
</ComposedModal>

<style>
  :global(.repair-modal-body) {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  :global(.repair-modal-body p) {
    margin: 0;
    color: var(--cds-text-02);
    line-height: 1.5;
  }

  .repair-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04) var(--cds-spacing-05);
    border-top: 1px solid var(--cds-border-subtle);
  }
</style>
