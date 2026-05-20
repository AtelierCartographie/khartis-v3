<script lang="ts">
  import { factoryResetPwa } from '$lib/features/commons/utils/pwa-offline';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { m } from '$lib/paraglide/messages.js';
  import {
    Button,
    ComposedModal,
    ModalBody,
    ModalFooter,
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
      logger.error('Clear cache failed', LogCategory.SYSTEM, error);
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
  on:submit={handleConfirm}
>
  <ModalHeader title={m.sidenav_clear_cache_confirm_title()} />
  <ModalBody>
    <p>{m.sidenav_clear_cache_confirm_body()}</p>
  </ModalBody>
  <ModalFooter
    primaryButtonText={m.sidenav_clear_cache_confirm_primary()}
    secondaryButtonText={m.sidenav_clear_cache_confirm_secondary()}
    primaryButtonDisabled={isBusy}
    on:click:button--secondary={closeModal}
  />
</ComposedModal>
